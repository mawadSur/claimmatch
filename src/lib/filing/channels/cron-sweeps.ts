/**
 * The housekeeping steps of the filing cron (docs/designs/one-click-filing.md,
 * sections 4, 10 and 12): expired locks, signed claims without a job,
 * hand-backs at the cutoff or after a policy change, staff alerts, expired
 * upload slots and document retention. Each step is bounded, idempotent and
 * safe to run twice at once (the database functions lock claim, then job).
 * Never retries a job after a submission may have happened.
 */
import { postAlertWebhook } from '@/lib/cron-alert';
import { addCalendarDays, LATE_REPORT_DAYS } from '@/lib/claim-deadlines';
import type { JevResult } from '@/lib/jev/types';
import { todayInDeadlineZone } from '@/lib/utils';
import { CLAIM_DOCUMENTS_BUCKET, DOCUMENT_RETENTION_DAYS } from '../v2/contract';
import { enqueueFiling, recordFilingResult, withdrawFiling } from '../v2/jobs';
import {
  laneFor,
  loadJobContext,
  loadSettlementFiling,
  loadSpec,
  officialDeadline,
  preSendCheck,
  sha256Text,
  type ServiceClient,
  type SettlementFiling,
  type SpecRow,
} from './context';
import type { LaneDecision } from './index';
import { needsDocumentsFor } from './lane';
import { memberSafeReason } from './reasons';
import type { FilingJobRecord } from './types';

const DAY_MS = 86_400_000;
export const URGENT_DAYS = 3;

/** Blocks a member cannot fix by editing the claim: those hand it back to the official site. */
const NOT_MEMBER_FIXABLE = new Set([
  'global.settlement_open',
  'global.lane_allowed',
  'global.spec_approved',
  'global.deadline_cutoff',
  'global.allowed_states',
  'global.statement_unchanged',
]);

export function blockedDestination(result: JevResult): 'needs_you' | 'self_file' | 'retry' {
  const blocks = result.issues.filter((i) => i.severity === 'block');
  if (blocks.some((i) => i.code === 'engine_unavailable')) return 'retry';
  // What the member is never shown they cannot fix: a settlement rule written for staff, or a
  // block only staff issues explain (Jev's member line for it is staff_check_required).
  const staffOnly = (i: (typeof blocks)[number]) =>
    (i.source === 'settlement' && i.audience === 'staff') || i.code === 'staff_check_required';
  return blocks.some((i) => NOT_MEMBER_FIXABLE.has(i.rule_id) || staffOnly(i)) ? 'self_file' : 'needs_you';
}

/** The member-safe reason for a hand-back decision (the first reason, mapped). */
export function handBackReason(decision: LaneDecision): string {
  return memberSafeReason(decision.reasons[0] ?? null, 'not_offered_for_settlement');
}

/** A signed packet stays valid on a superseded spec version; a retired one is no spec. */
export function signedSpecForLane(spec: SpecRow | null): SpecRow | null {
  if (!spec || spec.status === 'retired' || spec.status === 'draft') return null;
  return spec.status === 'superseded' ? { ...spec, status: 'approved' } : spec;
}

export async function cachedSettlement(
  svc: ServiceClient,
  cache: Map<string, SettlementFiling | null>,
  lawsuitId: string,
): Promise<SettlementFiling | null> {
  if (!cache.has(lawsuitId)) cache.set(lawsuitId, await loadSettlementFiling(svc, lawsuitId));
  return cache.get(lawsuitId) ?? null;
}

/** In-progress jobs whose lock ran out: a person may have submitted, so needs_attention, never queued. */
export async function expireStaleLocks(svc: ServiceClient, now: Date): Promise<{ expired: number; failed: number }> {
  const { data, error } = await svc
    .from('claim_filing_jobs')
    .select('id, lock_owner')
    .eq('status', 'in_progress')
    .lt('lock_expires_at', now.toISOString())
    .limit(100);
  if (error) throw new Error(`stale locks: ${error.code ?? 'read failed'}`);
  let expired = 0;
  let failed = 0;
  for (const row of (data ?? []) as Array<{ id: string; lock_owner: string | null }>) {
    const done = await recordFilingResult({
      jobId: row.id,
      lockOwner: row.lock_owner,
      outcome: 'needs_attention',
      reasonCode: 'lock_expired',
      // Staff only: the desk agent who held it may still record what happened.
      result: { expired_lock_owner: row.lock_owner },
      actor: 'system',
      now,
    });
    if (done.ok) expired += 1;
    else failed += 1;
  }
  return { expired, failed };
}

function virtualJob(sig: Record<string, unknown>, claim: { id: string; user_id: string; lawsuit_id: string }): FilingJobRecord {
  return {
    id: `sig:${String(sig.id)}`,
    claim_id: claim.id,
    user_id: claim.user_id,
    lawsuit_id: claim.lawsuit_id,
    packet_id: String(sig.packet_id),
    signature_id: String(sig.id),
    packet_hash: String(sig.packet_hash),
    policy_id: null,
    spec_id: String(sig.spec_id),
    channel: sig.lane as FilingJobRecord['channel'],
    status: 'queued',
    idempotency_key: `sig:${String(sig.id)}`,
    attempt: 0,
    run_after: '',
    due_by: null,
    locked_at: null,
    lock_owner: null,
    lock_expires_at: null,
    export_batch_id: null,
    confirmation_number: null,
    result: {},
    evidence: [],
    needs_attention_reason: null,
    closed_reason: null,
    filed_at: null,
    closed_at: null,
    created_at: '',
    updated_at: '',
  };
}

/**
 * A signed claim with no job (queueing failed after the signature): queue it
 * on the signed lane only if Jev pre_send passes; otherwise send it back to
 * the member (needs_you) or to the official site (self_file).
 */
export async function repairSignedWithoutJob(
  svc: ServiceClient,
  now: Date,
  settlements: Map<string, SettlementFiling | null>,
  shouldStop: () => boolean = () => false,
): Promise<{ queued: number; returned: number; skipped: number }> {
  const { data, error } = await svc.from('claims').select('id, user_id, lawsuit_id').eq('status', 'signed').limit(50);
  if (error) throw new Error(`signed claims: ${error.code ?? 'read failed'}`);
  const out = { queued: 0, returned: 0, skipped: 0 };
  for (const claim of (data ?? []) as Array<{ id: string; user_id: string; lawsuit_id: string }>) {
    if (shouldStop()) break;
    const { data: sigs } = await svc
      .from('claim_signatures')
      .select('id, packet_id, packet_hash, spec_id, lane, signed_at')
      .eq('claim_id', claim.id)
      .order('signed_at', { ascending: false })
      .limit(1);
    const sig = (sigs ?? [])[0] as Record<string, unknown> | undefined;
    if (!sig) {
      out.skipped += 1;
      continue;
    }
    const { data: job } = await svc.from('claim_filing_jobs').select('id').eq('signature_id', String(sig.id)).maybeSingle();
    if (job) {
      out.skipped += 1;
      continue;
    }
    const loaded = await loadJobContext(svc, virtualJob(sig, claim), settlements);
    if (!loaded.ok || loaded.ctx.signature.voided) {
      out.skipped += 1;
      continue;
    }
    const ctx = loaded.ctx;
    const { result } = await preSendCheck(svc, ctx, now, 'worker');
    if (result.outcome === 'block') {
      const to = blockedDestination(result);
      if (to === 'retry') {
        out.skipped += 1;
        continue;
      }
      const moved = await withdrawFiling({
        claimId: claim.id,
        userId: claim.user_id,
        to,
        reasonCode: to === 'needs_you' ? 'details_need_correction' : 'not_offered_for_settlement',
        actor: 'system',
        now,
      });
      if (moved.ok) out.returned += 1;
      else out.skipped += 1;
      continue;
    }
    const decision = laneFor(ctx.settlement, {
      now,
      spec: signedSpecForLane(ctx.spec),
      memberState: ctx.packet.member.address.state,
      benefitTier: ctx.packet.benefit_tier,
      needsDocuments: needsDocumentsFor(ctx.spec.content, ctx.packet.benefit_tier, ctx.packet.documents.length),
      healthGiven: ctx.packet.confirmations.health_data_consent,
      // Capacity and email configuration were checked at signing; they do not undo a signature.
      deskOpenJobs: 0,
      emailConfigured: true,
    });
    if (decision.agent && decision.lane === ctx.signature.lane) {
      const queued = await enqueueFiling({ signatureId: ctx.signature.signature_id, decision, actor: 'system', now });
      if (queued.ok) out.queued += 1;
      else out.skipped += 1;
      continue;
    }
    const moved = await withdrawFiling({
      claimId: claim.id,
      userId: claim.user_id,
      to: decision.agent ? 'needs_you' : 'self_file',
      reasonCode: decision.agent ? 'lane_changed' : handBackReason(decision),
      actor: 'system',
      now,
    });
    if (moved.ok) out.returned += 1;
    else out.skipped += 1;
  }
  return out;
}

const OPEN_AGENT_STATUSES = ['preparing', 'ready', 'signed', 'queued', 'needs_you'] as const;
/**
 * Open agent claims are read a page at a time (oldest change first), so every
 * one is checked however many there are, and the claim id lists sent to the
 * database stay short. At most HAND_BACK_MAX_PAGES pages a run.
 */
export const HAND_BACK_PAGE = 200;
export const HAND_BACK_MAX_PAGES = 25;

type OpenClaim = { id: string; user_id: string; lawsuit_id: string; status: string };
type HandBackCounts = { checked: number; handedBack: number; resign: number; failed: number };

/**
 * Open agent claims Lawsuit AI can no longer take (the channel's cutoff
 * passed, a kill switch, an objection, a policy or spec change): back to the
 * official site with a notice while the member still has days to file. A
 * signed claim whose lane changed goes back to the member to sign again.
 * Desk capacity and email configuration never trigger a hand-back.
 */
export async function handBackSweep(
  svc: ServiceClient,
  now: Date,
  settlements: Map<string, SettlementFiling | null>,
  limit = 100,
  shouldStop: () => boolean = () => false,
): Promise<HandBackCounts> {
  // Bounded per run. Open agent claims exist only on law-firm-approved settlements.
  const out: HandBackCounts = { checked: 0, handedBack: 0, resign: 0, failed: 0 };
  const specs = new Map<string, SpecRow | null>();
  for (let page = 0; page < HAND_BACK_MAX_PAGES; page += 1) {
    if (out.handedBack + out.resign + out.failed >= limit || shouldStop()) break;
    const from = page * HAND_BACK_PAGE;
    const { data, error } = await svc
      .from('claims')
      .select('id, user_id, lawsuit_id, status')
      .in('status', [...OPEN_AGENT_STATUSES])
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + HAND_BACK_PAGE - 1);
    if (error) throw new Error(`open agent claims: ${error.code ?? 'read failed'}`);
    const claims = (data ?? []) as OpenClaim[];
    if (claims.length === 0) break;
    await handBackPage(svc, now, settlements, claims, specs, out, limit, shouldStop);
    if (claims.length < HAND_BACK_PAGE) break;
  }
  return out;
}

/** One page of handBackSweep: the lane each claim would get today, and the moves. */
async function handBackPage(
  svc: ServiceClient,
  now: Date,
  settlements: Map<string, SettlementFiling | null>,
  claims: OpenClaim[],
  specs: Map<string, SpecRow | null>,
  out: HandBackCounts,
  limit: number,
  shouldStop: () => boolean,
): Promise<void> {
  const ids = claims.map((c) => c.id);
  const [{ data: packets }, { data: profiles }, { data: docs }, { data: sigs }] = await Promise.all([
    svc
      .from('claim_packets')
      .select('claim_id, spec_id, benefit_tier, member_snapshot, health_consent_at, health_consent_text_sha256')
      .in('claim_id', ids),
    svc.from('profiles').select('id, state').in('id', [...new Set(claims.map((c) => c.user_id))]),
    svc.from('claim_documents').select('claim_id').in('claim_id', ids).eq('source', 'member').eq('status', 'stored'),
    svc.from('claim_signatures').select('id, claim_id, lane, signed_at').in('claim_id', ids).order('signed_at', { ascending: false }),
  ]);
  const packetOf = new Map(((packets ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.claim_id), p]));
  const stateOf = new Map(((profiles ?? []) as Array<{ id: string; state: string | null }>).map((p) => [p.id, p.state]));
  const docCount = new Map<string, number>();
  for (const d of (docs ?? []) as Array<{ claim_id: string }>) docCount.set(d.claim_id, (docCount.get(d.claim_id) ?? 0) + 1);
  const laneOf = new Map<string, string>();
  for (const s of (sigs ?? []) as Array<{ claim_id: string; lane: string }>) if (!laneOf.has(s.claim_id)) laneOf.set(s.claim_id, s.lane);

  for (const claim of claims) {
    if (out.handedBack + out.resign + out.failed >= limit || shouldStop()) break;
    const settlement = await cachedSettlement(svc, settlements, claim.lawsuit_id);
    const packet = packetOf.get(claim.id);
    if (!settlement || !packet) continue;
    out.checked += 1;
    const signed = claim.status === 'signed' || claim.status === 'queued';
    let spec: SpecRow | null = settlement.approvedSpec;
    if (signed && typeof packet.spec_id === 'string') {
      if (!specs.has(packet.spec_id)) specs.set(packet.spec_id, await loadSpec(svc, packet.spec_id));
      spec = signedSpecForLane(specs.get(packet.spec_id) ?? null);
    }
    const snapshot = (packet.member_snapshot ?? {}) as { address?: { state?: string | null } };
    const tier = typeof packet.benefit_tier === 'string' ? packet.benefit_tier : null;
    const consentText = settlement.policy.health_consent_text;
    const consented =
      typeof packet.health_consent_at === 'string' &&
      (!consentText || packet.health_consent_text_sha256 === sha256Text(consentText));
    const decision = laneFor(settlement, {
      now,
      spec,
      memberState: snapshot.address?.state ?? stateOf.get(claim.user_id) ?? null,
      benefitTier: tier,
      needsDocuments: spec ? needsDocumentsFor(spec.content, tier, docCount.get(claim.id) ?? 0) : false,
      healthGiven: consented ? true : null,
      deskOpenJobs: 0,
      emailConfigured: true,
    });
    const keep = signed ? decision.agent && decision.lane === laneOf.get(claim.id) : decision.agent;
    if (keep) continue;
    const resign = signed && decision.agent;
    const moved = await withdrawFiling({
      claimId: claim.id,
      userId: claim.user_id,
      to: resign ? 'needs_you' : 'self_file',
      reasonCode: resign ? 'lane_changed' : handBackReason(decision),
      actor: 'system',
      now,
    });
    if (!moved.ok) out.failed += 1;
    else if (resign) out.resign += 1;
    else out.handedBack += 1;
  }
}

/** Staff alerts (counts only, never member data): needs_attention every run, urgent near the deadline; desk jobs past due. */
export async function staffAlerts(svc: ServiceClient, now: Date): Promise<{ needsAttention: number; urgent: number; overdue: number }> {
  const [{ data: attention, error }, { data: overdueRows }] = await Promise.all([
    svc.from('claim_filing_jobs').select('id, lawsuit_id').eq('status', 'needs_attention').limit(1000),
    svc
      .from('claim_filing_jobs')
      .select('id')
      .eq('channel', 'filing_desk')
      .in('status', ['queued', 'in_progress'])
      .lt('due_by', now.toISOString())
      .limit(1000),
  ]);
  if (error) throw new Error(`needs_attention jobs: ${error.code ?? 'read failed'}`);
  const rows = (attention ?? []) as Array<{ id: string; lawsuit_id: string }>;
  let urgent = 0;
  if (rows.length) {
    const { data: lawsuits } = await svc.from('lawsuits').select('id, slug, deadline').in('id', [...new Set(rows.map((r) => r.lawsuit_id))]);
    const cap = addCalendarDays(todayInDeadlineZone(now), URGENT_DAYS) as string;
    const soon = new Set(
      ((lawsuits ?? []) as Array<{ id: string; slug: string; deadline: string | null }>)
        .filter((l) => {
          const deadline = officialDeadline(l);
          return deadline !== null && deadline <= cap;
        })
        .map((l) => l.id),
    );
    urgent = rows.filter((r) => soon.has(r.lawsuit_id)).length;
  }
  const overdue = (overdueRows ?? []).length;
  if (rows.length || overdue) {
    const parts = [`${rows.length} filing job(s) need attention`];
    if (urgent) parts.push(`URGENT: ${urgent} with a deadline in ${URGENT_DAYS} days or less`);
    if (overdue) parts.push(`${overdue} desk job(s) past due`);
    await postAlertWebhook({ job: 'cron/filing', error: parts.join('; '), at: now.toISOString() });
  }
  return { needsAttention: rows.length, urgent, overdue };
}

async function removeObjects(svc: ServiceClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await svc.storage.from(CLAIM_DOCUMENTS_BUCKET).remove(paths);
  return !error;
}

/** Upload slots never completed within their two hours: the object (if any) and the slot go. */
export async function expirePendingUploads(svc: ServiceClient, now: Date): Promise<{ deleted: number }> {
  const { data, error } = await svc
    .from('claim_documents')
    .select('id, storage_path')
    .eq('status', 'pending_upload')
    .lt('upload_expires_at', now.toISOString())
    .limit(200);
  if (error) throw new Error(`pending uploads: ${error.code ?? 'read failed'}`);
  const rows = (data ?? []) as Array<{ id: string; storage_path: string }>;
  if (rows.length === 0 || !(await removeObjects(svc, rows.map((r) => r.storage_path)))) return { deleted: 0 };
  const { data: updated } = await svc
    .from('claim_documents')
    .update({ status: 'deleted', deleted_at: now.toISOString(), delete_reason: 'upload_expired' })
    .in('id', rows.map((r) => r.id))
    .eq('status', 'pending_upload')
    .select('id');
  return { deleted: (updated ?? []).length };
}

const FINAL_STATUSES = new Set(['submitted', 'withdrawn', 'not_reported_filed']);
/** Retention reads old uploads a page at a time (oldest first) until it has a batch to delete. */
export const RETENTION_PAGE = 200;
export const RETENTION_MAX_PAGES = 10;

type RetentionDoc = { id: string; claim_id: string; packet_id: string | null; storage_path: string };

/** The documents of one page whose retention has run out. */
async function dueForRetention(svc: ServiceClient, docs: RetentionDoc[], cutoff: string, today: string): Promise<RetentionDoc[]> {
  const claimIds = [...new Set(docs.map((d) => d.claim_id))];
  const [{ data: claims }, { data: packets }] = await Promise.all([
    svc.from('claims').select('id, status, updated_at, lawsuit_id').in('id', claimIds),
    svc.from('claim_packets').select('id, status').in('claim_id', claimIds),
  ]);
  const claimOf = new Map(((claims ?? []) as Array<{ id: string; status: string; updated_at: string; lawsuit_id: string }>).map((c) => [c.id, c]));
  const signedPackets = new Set(((packets ?? []) as Array<{ id: string; status: string }>).filter((p) => p.status === 'signed').map((p) => p.id));
  const lawsuitIds = [...new Set([...claimOf.values()].map((c) => c.lawsuit_id))];
  const { data: lawsuits } = lawsuitIds.length
    ? await svc.from('lawsuits').select('id, slug, deadline').in('id', lawsuitIds)
    : { data: [] as Array<{ id: string; slug: string; deadline: string | null }> };
  const deadlineOfLawsuit = new Map(
    ((lawsuits ?? []) as Array<{ id: string; slug: string; deadline: string | null }>).map((l) => [l.id, officialDeadline(l)]),
  );
  return docs.filter((doc) => {
    const claim = claimOf.get(doc.claim_id);
    if (!claim || (doc.packet_id && signedPackets.has(doc.packet_id))) return false;
    if (FINAL_STATUSES.has(claim.status) && Date.parse(claim.updated_at) <= Date.parse(cutoff)) return true;
    const deadline = deadlineOfLawsuit.get(claim.lawsuit_id);
    const last = deadline ? addCalendarDays(deadline, LATE_REPORT_DAYS + DOCUMENT_RETENTION_DAYS) : null;
    return Boolean(last && last < today);
  });
}

/**
 * Member uploads go DOCUMENT_RETENTION_DAYS after the claim's final status
 * (submitted, withdrawn, not_reported_filed), or after the deadline plus the
 * late-report window, whatever the status. Never a document of a signed
 * packet (it is part of what was signed and a job may still need it).
 * Staff evidence and signatures are legal records and stay. Old uploads that
 * must stay longer never hold back the ones that are due: they are read page
 * by page, oldest first.
 */
export async function retentionSweep(svc: ServiceClient, now: Date): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * DAY_MS).toISOString();
  const today = todayInDeadlineZone(now);
  const due: RetentionDoc[] = [];
  for (let page = 0; page < RETENTION_MAX_PAGES && due.length < RETENTION_PAGE; page += 1) {
    const from = page * RETENTION_PAGE;
    const { data, error } = await svc
      .from('claim_documents')
      .select('id, claim_id, packet_id, storage_path')
      .eq('source', 'member')
      .in('status', ['stored', 'rejected'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + RETENTION_PAGE - 1);
    if (error) throw new Error(`retention: ${error.code ?? 'read failed'}`);
    const docs = (data ?? []) as RetentionDoc[];
    if (docs.length === 0) break;
    due.push(...(await dueForRetention(svc, docs, cutoff, today)));
    if (docs.length < RETENTION_PAGE) break;
  }
  const batch = due.slice(0, RETENTION_PAGE);
  if (batch.length === 0 || !(await removeObjects(svc, batch.map((d) => d.storage_path)))) return { deleted: 0 };
  const { data: updated } = await svc
    .from('claim_documents')
    .update({ status: 'deleted', deleted_at: now.toISOString(), delete_reason: 'retention' })
    .in('id', batch.map((d) => d.id))
    .in('status', ['stored', 'rejected'])
    .select('id');
  return { deleted: (updated ?? []).length };
}
