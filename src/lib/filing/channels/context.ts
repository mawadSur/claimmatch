/**
 * Server loaders for the channel side of one-click filing: a settlement's
 * filing context (policy in force, approved spec, deadline) and a job's
 * context (its signature, the signed packet checked against its hash, the
 * spec version it was signed on, its stored documents), plus Jev pre_send
 * on a job, stored in jev_runs. Service role only; callers check who asks.
 */
import { createHash } from 'node:crypto';
import { runJev, JEV_ENGINE_VERSION } from '@/lib/jev';
import type { JevInput, JevResult, JevTrigger } from '@/lib/jev/types';
import { isVerifiedSender } from '@/lib/closing-soon-email';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { guidedDeadline } from '@/lib/settlement-guides';
import { createServiceClient } from '@/lib/supabase/server';
import { CLAIM_DOCUMENTS_BUCKET, CanonicalPacketSchema, normalizeTypedName, type CanonicalPacket } from '../v2/contract';
import { FilingSpecContentSchema, type EffectiveFilingPolicy, type FilingSpecContent, type SpecStatus } from '../v2/contract-spec';
import { daysUntilDate, effectiveDeadline, specTimeZone, toIsoDate, DEFAULT_DEADLINE_TIME_ZONE } from './dates';
import { chooseLane, resolveEffectivePolicy, type LaneDecision } from './index';
import { healthConsentRequiredFor } from './lane';
import { controlsRecordFromRow, policyRecordFromRow, POLICY_SELECT } from './policy';
import type { ChannelDocument, FilingJobRecord, SignatureBlock } from './types';

export type ServiceClient = ReturnType<typeof createServiceClient>;

export function sha256Text(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Resend can send to an administrator: a key and a real sender (not Resend's
 * onboarding address). The same rule as the member side's lane facts
 * (src/lib/filing/v2/environment.ts), so both pick the same lane.
 */
export function emailChannelConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim()) && isVerifiedSender(env.RESEND_FROM);
}

export interface LawsuitFacts {
  id: string;
  slug: string;
  title: string;
  status: string;
  review_status: string;
  deadline: string | null;
  claim_url: string | null;
  administrator_id: string | null;
  third_party_fee_status: 'unknown' | 'allowed' | 'barred';
}
export const LAWSUIT_SELECT = 'id, slug, title, status, review_status, deadline, claim_url, administrator_id, third_party_fee_status';

export interface SpecRow {
  id: string;
  lawsuit_id: string;
  version: number;
  status: SpecStatus;
  content: FilingSpecContent;
}

export interface SettlementFiling {
  lawsuit: LawsuitFacts;
  administrator: { id: string; slug: string; name: string } | null;
  policy: EffectiveFilingPolicy;
  approvedSpec: SpecRow | null;
}

/**
 * The settlement's deadline as the rest of the site shows it: a guided
 * settlement's hand-checked official deadline, else the catalog's (the
 * member API and deadline reminders read it the same way).
 */
export function officialDeadline(row: { slug?: unknown; deadline?: unknown }): string | null {
  return toIsoDate(guidedDeadline({ slug: String(row.slug ?? ''), deadline: typeof row.deadline === 'string' ? row.deadline : null }));
}

export function lawsuitFacts(row: Record<string, unknown>): LawsuitFacts {
  const fee = row.third_party_fee_status;
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? 'Settlement'),
    status: String(row.status ?? ''),
    review_status: String(row.review_status ?? ''),
    deadline: officialDeadline(row),
    claim_url: typeof row.claim_url === 'string' ? row.claim_url : null,
    administrator_id: typeof row.administrator_id === 'string' ? row.administrator_id : null,
    third_party_fee_status: fee === 'allowed' || fee === 'barred' ? fee : 'unknown',
  };
}

/** A filing_specs row whose content parses, else null (an unreadable spec is no spec). */
export function specRowFrom(row: Record<string, unknown> | null | undefined): SpecRow | null {
  if (!row) return null;
  const content = FilingSpecContentSchema.safeParse(row.content);
  if (!content.success) return null;
  return {
    id: String(row.id),
    lawsuit_id: String(row.lawsuit_id),
    version: Number(row.version),
    status: String(row.status) as SpecStatus,
    content: content.data,
  };
}

export async function loadSpec(svc: ServiceClient, specId: string): Promise<SpecRow | null> {
  const { data } = await svc.from('filing_specs').select('id, lawsuit_id, version, status, content').eq('id', specId).maybeSingle();
  return specRowFrom(data as Record<string, unknown> | null);
}

/**
 * The policy in force, the approved spec and the settlement facts. null when
 * the settlement cannot be read, or when any part of its filing configuration
 * cannot: a failed read of a kill switch, an objection or an administrator's
 * prohibition must never look like "none" (callers then refuse: needs_attention,
 * no hand-out, no queueing).
 */
export async function loadSettlementFiling(svc: ServiceClient, lawsuitId: string): Promise<SettlementFiling | null> {
  const { data: row, error } = await svc.from('lawsuits').select(LAWSUIT_SELECT).eq('id', lawsuitId).maybeSingle();
  if (error || !row) return null;
  const lawsuit = lawsuitFacts(row as Record<string, unknown>);
  const adminId = lawsuit.administrator_id;
  const none = Promise.resolve({ data: null, error: null });
  const reads = await Promise.all([
    svc.from('filing_policies').select(POLICY_SELECT).eq('lawsuit_id', lawsuitId).eq('status', 'approved').maybeSingle(),
    adminId
      ? svc.from('filing_policies').select(POLICY_SELECT).eq('administrator_id', adminId).eq('status', 'approved').maybeSingle()
      : none,
    svc.from('filing_controls').select('*').eq('lawsuit_id', lawsuitId).maybeSingle(),
    adminId ? svc.from('filing_controls').select('*').eq('administrator_id', adminId).maybeSingle() : none,
    svc.from('filing_specs').select('id, lawsuit_id, version, status, content').eq('lawsuit_id', lawsuitId).eq('status', 'approved').maybeSingle(),
    adminId ? svc.from('administrators').select('id, slug, name').eq('id', adminId).maybeSingle() : none,
  ]);
  const failed = reads.find((read) => (read as { error?: { code?: string } | null }).error);
  if (failed) {
    console.error('[filing/settlement] filing configuration read failed', {
      code: (failed as { error?: { code?: string } | null }).error?.code ?? null,
    });
    return null;
  }
  const [settlementPolicy, adminPolicy, settlementControls, adminControls, spec, administrator] = reads;
  const policy = resolveEffectivePolicy({
    settlementPolicy: policyRecordFromRow(settlementPolicy.data as Record<string, unknown> | null, 'settlement'),
    administratorPolicy: policyRecordFromRow(adminPolicy.data as Record<string, unknown> | null, 'administrator'),
    settlementControls: controlsRecordFromRow(settlementControls.data as Record<string, unknown> | null),
    administratorControls: controlsRecordFromRow(adminControls.data as Record<string, unknown> | null),
    thirdPartyFeeStatus: lawsuit.third_party_fee_status,
  });
  const admin = administrator.data as { id: string; slug: string; name: string } | null;
  return { lawsuit, administrator: admin ?? null, policy, approvedSpec: specRowFrom(spec.data as Record<string, unknown> | null) };
}

/** The effective deadline (earlier of the settlement's and the spec's) and its time zone. */
export function deadlineOf(lawsuit: LawsuitFacts, spec: SpecRow | null): { deadline: string | null; zone: string } {
  return {
    deadline: effectiveDeadline(lawsuit.deadline, spec?.content.deadline?.date ?? null),
    zone: (spec && specTimeZone(spec.content)) || DEFAULT_DEADLINE_TIME_ZONE,
  };
}

/** Open desk jobs across the desk (its whole backlog); null when the count cannot be read. */
export async function countOpenDeskJobs(svc: ServiceClient): Promise<number | null> {
  const { count, error } = await svc
    .from('claim_filing_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'filing_desk')
    .in('status', ['queued', 'in_progress', 'exported', 'needs_attention']);
  return error || typeof count !== 'number' ? null : count;
}

export interface LaneFacts {
  now: Date;
  /** The spec the lane is decided on: the approved one, or for a signed claim the version it was signed on. */
  spec: SpecRow | null;
  memberState: string | null;
  benefitTier: string | null;
  needsDocuments: boolean;
  healthGiven: boolean | null;
  deskOpenJobs: number | null;
  emailConfigured: boolean;
}

export function laneFor(settlement: SettlementFiling, facts: LaneFacts): LaneDecision {
  const { deadline } = deadlineOf(settlement.lawsuit, facts.spec);
  return chooseLane({
    now: facts.now,
    policy: settlement.policy,
    settlement: { openForClaims: isOpenForClaims(settlement.lawsuit, facts.now), deadline },
    spec: facts.spec,
    member: { state: facts.memberState },
    needsDocuments: facts.needsDocuments,
    healthConsent: {
      required: healthConsentRequiredFor(facts.spec?.content ?? null, facts.benefitTier, settlement.policy.health_sensitive),
      given: facts.healthGiven,
    },
    desk: facts.deskOpenJobs === null ? null : { openJobs: facts.deskOpenJobs },
    email: { configured: facts.emailConfigured },
  });
}

export interface JobContext {
  job: FilingJobRecord;
  claim: { id: string; user_id: string; lawsuit_id: string; status: string };
  signature: SignatureBlock & { statement_sha256: string; voided: boolean };
  packet: CanonicalPacket;
  packetRow: { id: string; status: string; health_consent_text_sha256: string | null };
  spec: SpecRow;
  settlement: SettlementFiling;
  documents: ChannelDocument[];
}

export type JobContextResult = { ok: true; ctx: JobContext } | { ok: false; reason: string };

/** Loads and checks everything a send needs. Any inconsistency is a reason, never a guess. */
export async function loadJobContext(
  svc: ServiceClient,
  job: FilingJobRecord,
  settlements: Map<string, SettlementFiling | null> = new Map(),
): Promise<JobContextResult> {
  const [{ data: claim }, { data: sig }, { data: voidRow }, { data: packetRow }] = await Promise.all([
    svc.from('claims').select('id, user_id, lawsuit_id, status').eq('id', job.claim_id).maybeSingle(),
    svc
      .from('claim_signatures')
      .select('id, claim_id, spec_id, packet_hash, packet_canonical, statement_text, statement_sha256, authorization_text_version, typed_name, lane, signed_at')
      .eq('id', job.signature_id)
      .maybeSingle(),
    svc.from('claim_signature_voids').select('id').eq('signature_id', job.signature_id).maybeSingle(),
    svc.from('claim_packets').select('id, status, health_consent_text_sha256').eq('id', job.packet_id).maybeSingle(),
  ]);
  if (!claim || !sig || !packetRow) return { ok: false, reason: 'record_missing' };
  const canonical = String(sig.packet_canonical ?? '');
  if (sha256Text(canonical) !== sig.packet_hash || sig.packet_hash !== job.packet_hash) {
    return { ok: false, reason: 'packet_hash_mismatch' };
  }
  let parsed: ReturnType<typeof CanonicalPacketSchema.safeParse>;
  try {
    parsed = CanonicalPacketSchema.safeParse(JSON.parse(canonical));
  } catch {
    return { ok: false, reason: 'packet_unreadable' };
  }
  if (!parsed.success || parsed.data.claim_id !== job.claim_id || parsed.data.spec.id !== job.spec_id) {
    return { ok: false, reason: 'packet_unreadable' };
  }
  const packet = parsed.data;
  const spec = await loadSpec(svc, job.spec_id);
  if (!spec || spec.version !== packet.spec.version) return { ok: false, reason: 'spec_unreadable' };
  if (!settlements.has(job.lawsuit_id)) settlements.set(job.lawsuit_id, await loadSettlementFiling(svc, job.lawsuit_id));
  const settlement = settlements.get(job.lawsuit_id);
  if (!settlement) return { ok: false, reason: 'settlement_unreadable' };

  const ids = packet.documents.map((d) => d.id);
  const { data: docRows } = ids.length
    ? await svc
        .from('claim_documents')
        .select('id, kind, mime, size_bytes, sha256, storage_path, status, source, claim_id')
        .in('id', ids)
    : { data: [] as Array<Record<string, unknown>> };
  const documents: ChannelDocument[] = ((docRows ?? []) as Array<Record<string, unknown>>)
    .filter((d) => d.status === 'stored' && d.source === 'member' && d.claim_id === job.claim_id)
    .map((d) => ({
      id: String(d.id),
      kind: String(d.kind),
      official_label: String(d.kind),
      mime: String(d.mime),
      size_bytes: Number(d.size_bytes),
      sha256: String(d.sha256),
      read: () => readStoredFile(svc, String(d.storage_path)),
    }));

  return {
    ok: true,
    ctx: {
      job,
      claim: claim as JobContext['claim'],
      signature: {
        signature_id: String(sig.id),
        typed_name: String(sig.typed_name),
        signed_at: String(sig.signed_at),
        packet_hash: String(sig.packet_hash),
        statement_text: String(sig.statement_text),
        statement_sha256: String(sig.statement_sha256),
        authorization_text_version: String(sig.authorization_text_version),
        lane: sig.lane as SignatureBlock['lane'],
        voided: Boolean(voidRow),
      },
      packet,
      packetRow: packetRow as JobContext['packetRow'],
      spec,
      settlement,
      documents,
    },
  };
}

/** The bytes of a stored file in the claim-documents bucket. Throws when it cannot be read. */
export async function readStoredFile(svc: ServiceClient, path: string): Promise<Uint8Array> {
  const { data, error } = await svc.storage.from(CLAIM_DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error('storage_read_failed');
  return new Uint8Array(await data.arrayBuffer());
}

function identityKey(packet: Pick<CanonicalPacket, 'member'>): string {
  const m = packet.member;
  return [normalizeTypedName(m.legal_name), normalizeTypedName(m.address.line1), m.address.zip.slice(0, 5)].join('|');
}

/** Other accounts that signed a claim for this settlement with the same name and address (staff-audience Jev fact). */
export async function countSameIdentity(
  svc: ServiceClient,
  ctx: Pick<JobContext, 'packet' | 'claim'>,
  cache: Map<string, Array<{ user_id: string; key: string }>> = new Map(),
): Promise<number | null> {
  if (!cache.has(ctx.claim.lawsuit_id)) {
    const { data, error } = await svc
      .from('claim_signatures')
      .select('user_id, packet_canonical')
      .eq('lawsuit_id', ctx.claim.lawsuit_id)
      .limit(2000);
    if (error) return null;
    const keys: Array<{ user_id: string; key: string }> = [];
    for (const row of (data ?? []) as Array<{ user_id: string; packet_canonical: string }>) {
      try {
        const parsed = CanonicalPacketSchema.safeParse(JSON.parse(row.packet_canonical));
        if (parsed.success) keys.push({ user_id: row.user_id, key: identityKey(parsed.data) });
      } catch {
        // An unreadable packet is counted by no one.
      }
    }
    cache.set(ctx.claim.lawsuit_id, keys);
  }
  const mine = identityKey(ctx.packet);
  const others = new Set(
    (cache.get(ctx.claim.lawsuit_id) ?? []).filter((r) => r.key === mine && r.user_id !== ctx.claim.user_id).map((r) => r.user_id),
  );
  return others.size;
}

/** Jev's pre_send input for a job: the signed packet, the spec it was signed on, today's policy and deadline. */
export function preSendInput(ctx: JobContext, now: Date, duplicates: number | null): JevInput {
  const { deadline, zone } = deadlineOf(ctx.settlement.lawsuit, ctx.spec);
  const policy = ctx.settlement.policy;
  const consentText = policy.health_consent_text;
  const given =
    ctx.packet.confirmations.health_data_consent === true &&
    (!consentText || ctx.packetRow.health_consent_text_sha256 === sha256Text(consentText));
  return {
    mode: 'pre_send',
    now: now.toISOString(),
    lane: ctx.job.channel,
    packet: ctx.packet,
    packetHash: ctx.signature.packet_hash,
    spec: {
      id: ctx.spec.id,
      version: ctx.spec.version,
      status: ctx.spec.status,
      content: ctx.spec.content,
      attestation_sha256: sha256Text(ctx.spec.content.attestation.text),
      class_definition_sha256: sha256Text(ctx.spec.content.class_definition.text),
    },
    policy,
    settlement: {
      openForClaims: isOpenForClaims(ctx.settlement.lawsuit, now),
      deadline,
      daysToDeadline: daysUntilDate(deadline, zone, now),
    },
    healthConsent: {
      required: healthConsentRequiredFor(ctx.spec.content, ctx.packet.benefit_tier, policy.health_sensitive),
      textAvailable: Boolean(consentText),
      given,
    },
    signature: {
      id: ctx.signature.signature_id,
      packet_hash: ctx.signature.packet_hash,
      typed_name: ctx.signature.typed_name,
      statement_sha256: ctx.signature.statement_sha256,
      lane: ctx.signature.lane,
      voided: ctx.signature.voided,
      signed_at: ctx.signature.signed_at,
    },
    duplicates: duplicates === null ? null : { sameIdentityOtherAccounts: duplicates },
  };
}

/** A block result for when Jev itself cannot run: doubt never lets a claim out. */
function engineFailure(input: JevInput): JevResult {
  return {
    engine_version: JEV_ENGINE_VERSION,
    mode: input.mode,
    outcome: 'block',
    issues: [
      {
        rule_id: 'global.engine',
        source: 'global',
        severity: 'block',
        code: 'engine_unavailable',
        message: 'The checks could not run. Try again later.',
        field: null,
        audience: 'staff',
      },
    ],
    counts: { block: 1, warn: 0, info: 0 },
    rule_set_hash: sha256Text(`unavailable:${JEV_ENGINE_VERSION}`),
    packet_hash: input.packetHash,
    evaluated_at: input.now,
  };
}

/** Runs Jev and stores the run (jev_runs). A failed write is logged; the result still counts. */
export async function runAndStoreJev(
  svc: ServiceClient,
  input: JevInput,
  ids: { claimId: string; userId: string; packetId: string },
  triggeredBy: JevTrigger,
): Promise<{ result: JevResult; runId: string | null }> {
  let result: JevResult;
  try {
    result = runJev(input);
  } catch (err) {
    console.error('[filing/jev] runJev failed', { name: (err as Error)?.name });
    result = engineFailure(input);
  }
  const { data, error } = await svc
    .from('jev_runs')
    .insert({
      claim_id: ids.claimId,
      user_id: ids.userId,
      packet_id: ids.packetId,
      mode: result.mode,
      triggered_by: triggeredBy,
      outcome: result.outcome,
      issues: result.issues,
      packet_hash: input.packetHash,
      spec_id: input.spec?.id ?? null,
      spec_version: input.spec?.version ?? null,
      lane: input.lane,
      rule_set_hash: result.rule_set_hash,
      engine_version: result.engine_version,
    })
    .select('id')
    .single();
  if (error) console.error('[filing/jev] run not stored', { code: error.code });
  return { result, runId: (data as { id?: string } | null)?.id ?? null };
}

/** pre_send for one job, stored. */
export async function preSendCheck(
  svc: ServiceClient,
  ctx: JobContext,
  now: Date,
  triggeredBy: JevTrigger,
  identityCache?: Map<string, Array<{ user_id: string; key: string }>>,
): Promise<{ result: JevResult; runId: string | null }> {
  const duplicates = await countSameIdentity(svc, ctx, identityCache);
  return runAndStoreJev(
    svc,
    preSendInput(ctx, now, duplicates),
    { claimId: ctx.claim.id, userId: ctx.claim.user_id, packetId: ctx.packetRow.id },
    triggeredBy,
  );
}
