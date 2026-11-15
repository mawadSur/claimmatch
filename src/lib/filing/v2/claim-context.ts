/**
 * One claim as the member API sees it: the claim, its packet, uploads and
 * live signature (read with the member's own client, so RLS keeps it to
 * their rows), the settlement environment (service role), and the packet's
 * derived state (draft, canonical packet, hash, lane, health facts). Reads
 * only. Server only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CanonicalPacketSchema, type CanonicalPacket, type FilingErrorCode, type PacketDraft } from './contract';
import { createServiceClient } from '@/lib/supabase/server';
import { DOCUMENT_COLUMNS, toDocumentRecord, type DocumentRecord } from './documents';
import { loadSettlementEnvs, type LaneEnv, type SettlementEnv } from './environment';
import { logFilingError } from './http';
import { computeLane, healthFacts, plainSelfFileView, signedLaneView, type HealthFacts, type LaneResult } from './lanes';
import { buildPacketDraft, computePacketHash, toCanonicalPacket, type ProfileMemberFields } from './packet';
import {
  CONSENT_COLUMNS,
  EVENT_COLUMNS,
  PACKET_COLUMNS,
  SIGNATURE_COLUMNS,
  SPEC_COLUMNS,
  liveSignature,
  toClaimRecord,
  toConsentRecord,
  toPacketRecord,
  toSpecRecord,
  type ClaimRecord,
  type ConsentRecord,
  type PacketRecord,
  type SignatureRecord,
  type SpecRecord,
} from './records';
import type { LaneView } from './contract';

export const PROFILE_COLUMNS = 'full_name, email, phone, address_line1, address_line2, city, state, zip, prefill_consent_at';

export interface ProfileRecord extends ProfileMemberFields {
  prefill_consent_at: string | null;
}

export function toProfileRecord(row: Record<string, unknown> | null | undefined): ProfileRecord | null {
  if (!row) return null;
  const s = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : null);
  return {
    full_name: s('full_name'),
    email: s('email'),
    phone: s('phone'),
    address_line1: s('address_line1'),
    address_line2: s('address_line2'),
    city: s('city'),
    state: s('state'),
    zip: s('zip'),
    prefill_consent_at: s('prefill_consent_at'),
  };
}

export interface ClaimBundle {
  claim: ClaimRecord;
  packet: PacketRecord | null;
  /** The spec version the packet is on (it may no longer be the approved one). */
  packetSpec: SpecRecord | null;
  /** The member's uploads for this claim, every status. */
  documents: DocumentRecord[];
  signature: SignatureRecord | null;
}

export interface ClaimContext extends ClaimBundle {
  now: Date;
  userId: string;
  env: SettlementEnv;
  laneEnv: LaneEnv;
  profile: ProfileRecord | null;
  consents: ConsentRecord[];
  events: Record<string, unknown>[];
}

/** The packet columns a save may change. */
export interface PacketContent {
  answers: PacketRecord['answers'];
  member_snapshot: PacketRecord['member_snapshot'];
  benefit_tier: string | null;
  payout_method: string | null;
  class_definition_confirmed_at: string | null;
  health_consent_at: string | null;
  health_consent_text_sha256: string | null;
}

export interface PacketState {
  spec: SpecRecord | null;
  draft: PacketDraft;
  canonical: CanonicalPacket | null;
  hash: string | null;
  missing: string[];
  lane: LaneResult;
  health: HealthFacts;
}

type Result<T> = { data: T; error: { code?: string } | null };

/** Loads one of the member's claims. not_found when it is not theirs. */
export async function loadClaimContext(args: {
  supabase: SupabaseClient;
  userId: string;
  claimId: string;
  now: Date;
  withEvents?: boolean;
}): Promise<{ ok: true; ctx: ClaimContext } | { ok: false; code: FilingErrorCode }> {
  const { supabase, userId, claimId } = args;
  const claimRead = (await supabase.from('claims').select('*').eq('id', claimId).eq('user_id', userId).maybeSingle()) as Result<
    Record<string, unknown> | null
  >;
  if (claimRead.error) {
    logFilingError('claim read failed', claimRead.error);
    return { ok: false, code: 'service_unavailable' };
  }
  if (!claimRead.data) return { ok: false, code: 'not_found' };
  const claim = toClaimRecord(claimRead.data);

  const [packetRead, docsRead, sigRead, voidRead, profileRead, consentRead, eventRead, envs] = await Promise.all([
    supabase.from('claim_packets').select(PACKET_COLUMNS).eq('claim_id', claimId).maybeSingle(),
    supabase.from('claim_documents').select(DOCUMENT_COLUMNS).eq('claim_id', claimId),
    supabase.from('claim_signatures').select(SIGNATURE_COLUMNS).eq('claim_id', claimId),
    supabase.from('claim_signature_voids').select('signature_id').eq('claim_id', claimId),
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    supabase.from('esign_consents').select(CONSENT_COLUMNS).eq('user_id', userId).is('withdrawn_at', null),
    args.withEvents
      ? supabase.from('claim_events').select(EVENT_COLUMNS).eq('claim_id', claimId).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    loadSettlementEnvs([claim.lawsuit_id], args.now),
  ]);
  for (const read of [packetRead, docsRead, sigRead, voidRead, profileRead, consentRead, eventRead] as Result<unknown>[]) {
    if (read.error) {
      logFilingError('claim detail read failed', read.error);
      return { ok: false, code: 'service_unavailable' };
    }
  }
  if (!envs.ok) return { ok: false, code: 'settlement_unavailable' };
  const env = envs.envs.get(claim.lawsuit_id);
  if (!env) return { ok: false, code: 'settlement_unavailable' };

  const packet = packetRead.data ? toPacketRecord(packetRead.data as Record<string, unknown>) : null;
  const packetSpec = await loadPacketSpec(packet, env);
  if (packetSpec === 'error') return { ok: false, code: 'service_unavailable' };
  const voided = new Set(((voidRead.data ?? []) as Array<{ signature_id?: unknown }>).map((v) => String(v.signature_id)));
  return {
    ok: true,
    ctx: {
      now: args.now,
      userId,
      claim,
      env,
      laneEnv: envs.lane,
      packet,
      packetSpec,
      documents: ((docsRead.data ?? []) as Record<string, unknown>[]).map(toDocumentRecord).filter((d) => d.source === 'member'),
      signature: liveSignature((sigRead.data ?? []) as Record<string, unknown>[], voided),
      profile: toProfileRecord(profileRead.data as Record<string, unknown> | null),
      consents: ((consentRead.data ?? []) as Record<string, unknown>[])
        .map(toConsentRecord)
        .filter((c): c is ConsentRecord => c !== null && c.withdrawn_at === null),
      events: (eventRead.data ?? []) as Record<string, unknown>[],
    },
  };
}

/** The packet's own spec version: the approved one, or read by id when the packet is on an older version. */
export async function loadPacketSpec(packet: PacketRecord | null, env: SettlementEnv): Promise<SpecRecord | null | 'error'> {
  if (!packet?.spec_id) return null;
  if (env.approvedSpec?.id === packet.spec_id) return env.approvedSpec;
  const { data, error } = (await createServiceClient()
    .from('filing_specs')
    .select(SPEC_COLUMNS)
    .eq('id', packet.spec_id)
    .maybeSingle()) as Result<Record<string, unknown> | null>;
  if (error) {
    logFilingError('packet spec read failed', error);
    return 'error';
  }
  return toSpecRecord(data);
}

export function contentOf(packet: PacketRecord): PacketContent {
  return {
    answers: packet.answers,
    member_snapshot: packet.member_snapshot,
    benefit_tier: packet.benefit_tier,
    payout_method: packet.payout_method,
    class_definition_confirmed_at: packet.class_definition_confirmed_at,
    health_consent_at: packet.health_consent_at,
    health_consent_text_sha256: packet.health_consent_text_sha256,
  };
}

/**
 * The packet as it stands for these columns, spec and uploads. The lane
 * comes first (meta.lane may decide which questions are asked); health
 * consent counts only for the policy's current text.
 */
export function derivePacketState(
  ctx: Pick<ClaimContext, 'claim' | 'env' | 'laneEnv' | 'profile' | 'now'>,
  content: PacketContent,
  spec: SpecRecord | null,
  documents: DocumentRecord[],
): PacketState {
  const consent = healthFacts({ env: ctx.env, spec: null, draft: null, consent: { at: content.health_consent_at, textSha256: content.health_consent_text_sha256 } });
  const draft = buildPacketDraft({
    claim: { id: ctx.claim.id, lawsuit_id: ctx.claim.lawsuit_id },
    spec: spec ? { id: spec.id, version: spec.version, content: spec.content } : null,
    row: {
      answers: content.answers,
      member_snapshot: content.member_snapshot,
      benefit_tier: content.benefit_tier,
      payout_method: content.payout_method,
      class_definition_confirmed_at: content.class_definition_confirmed_at,
      health_consent_at: consent.given === true ? content.health_consent_at : null,
      health_consent_declined: consent.given === false,
    },
    profile: ctx.profile,
    documents,
    hashes: {
      class_definition_sha256: spec?.class_definition_sha256 ?? null,
      attestation_sha256: spec?.attestation_sha256 ?? null,
    },
  });
  const health = healthFacts({
    env: ctx.env,
    spec: spec?.content ?? null,
    draft,
    consent: { at: content.health_consent_at, textSha256: content.health_consent_text_sha256 },
  });
  const lane = computeLane({ env: ctx.env, laneEnv: ctx.laneEnv, draft, memberState: draft.member.address.state, health, now: ctx.now });
  if (!spec) return { spec, draft, canonical: null, hash: null, missing: ['spec'], lane, health };
  const canonical = toCanonicalPacket(draft, spec.content, { lane: lane.view.lane, daysToDeadline: lane.daysToDeadline });
  return canonical.ok
    ? { spec, draft, canonical: canonical.packet, hash: computePacketHash(canonical.packet), missing: [], lane, health }
    : { spec, draft, canonical: null, hash: null, missing: canonical.missing, lane, health };
}

/** The packet's current state from its stored columns (null without a packet). */
export function currentPacketState(ctx: ClaimContext): PacketState | null {
  if (!ctx.packet) return null;
  return derivePacketState(ctx, contentOf(ctx.packet), ctx.packetSpec, ctx.documents);
}

/** The signed canonical packet, when the packet is signed or closed with a live signature of it. */
export function signedPacket(ctx: Pick<ClaimContext, 'packet' | 'signature'>): CanonicalPacket | null {
  if (!ctx.packet || ctx.packet.status === 'open' || !ctx.signature || ctx.signature.packet_id !== ctx.packet.id) return null;
  try {
    const parsed = CanonicalPacketSchema.safeParse(JSON.parse(ctx.signature.packet_canonical));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const SIGNED_STATUSES = new Set(['signed', 'queued', 'filing', 'filed_by_claimmatch', 'submitted', 'filing_rejected']);
const OPEN_STATUSES = new Set(['preparing', 'ready', 'needs_you', 'self_file']);

/**
 * The lane the member sees: the signed lane while a live signature carries
 * the claim; self_file once the packet is closed or the claim is finished;
 * otherwise today's lane for the packet as it stands.
 */
export function memberLaneView(ctx: ClaimContext, state: PacketState | null, settlementLane: LaneResult): LaneView {
  const status = ctx.claim.status;
  if (ctx.signature && SIGNED_STATUSES.has(status)) return signedLaneView(ctx.signature.lane, state?.lane ?? settlementLane);
  if (ctx.packet?.status === 'closed' || !OPEN_STATUSES.has(status)) return plainSelfFileView(settlementLane.deadline);
  return (state?.lane ?? settlementLane).view;
}

/** Today's lane for the settlement alone (no packet yet), from the profile's state. */
export function settlementLane(ctx: Pick<ClaimContext, 'env' | 'laneEnv' | 'profile' | 'now'>): LaneResult {
  const health = healthFacts({ env: ctx.env, spec: null, draft: null, consent: null });
  return computeLane({
    env: ctx.env,
    laneEnv: ctx.laneEnv,
    draft: null,
    memberState: ctx.profile?.state ?? null,
    health,
    now: ctx.now,
  });
}
