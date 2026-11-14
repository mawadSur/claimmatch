/**
 * Filing jobs for the agent lanes. The signatures and comments are the
 * CONTRACT (implemented by B3). Each function calls one server-only database
 * function (0039, 0040) with the service role, so a job and its claim always
 * change together and every change lands in claim_events. Never retries a
 * job automatically after a submission may have happened.
 */
import { createServiceClient } from '@/lib/supabase/server';
import type { LaneDecision } from '../channels/index';
import type { MemberNoticeEvent } from '../channels/member-notices';
import { memberSafeReason, type MemberSafeReason } from '../channels/reasons';
import type { FilingEvidence, FilingJobRecord } from '../channels/types';
import { FILING_DB_ERRORS, FILING_ERROR_MESSAGES, isAgentLane, type FilingErrorCode } from './contract';
import type { AgentChannel } from './contract-spec';
import { canWorkFilingDesk, staffLockOwner, type StaffUser } from '../../staff-roles';

export type JobFailure = { ok: false; code: FilingErrorCode; message: string };

/** A desk job stays locked to the staff member who took it this long (design section 8). */
export const DESK_LOCK_MINUTES = 30;
/** A worker lock: the cron finishes well inside it; an expired one becomes needs_attention, never queued. */
export const WORKER_LOCK_MINUTES = 15;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

type DbError = { code?: string | null; message?: string | null } | null | undefined;

export function jobFailure(code: FilingErrorCode): JobFailure {
  return { ok: false, code, message: FILING_ERROR_MESSAGES[code] };
}

/** A database error as an API code (FILING_DB_ERRORS), with per-call overrides. */
export function dbJobFailure(error: DbError, overrides: Partial<Record<string, FilingErrorCode>> = {}): JobFailure {
  const sqlState = error?.code ?? '';
  const code = overrides[sqlState] ?? FILING_DB_ERRORS[sqlState] ?? (sqlState === '22P02' ? 'invalid_request' : 'service_unavailable');
  if (code === 'service_unavailable') console.error('[filing/jobs] database error', { code: sqlState || null });
  return jobFailure(code);
}

/** Member notices load their own module, so importers of this file stay light. Never throws. */
async function notify(event: MemberNoticeEvent): Promise<void> {
  try {
    const { notifyMember } = await import('../channels/member-notices');
    await notifyMember(event);
  } catch {
    console.warn('[filing/jobs] notice skipped', { kind: event.kind, claim: event.claimId });
  }
}

export interface EnqueueFilingInput {
  /** The live signature just stored by filing_sign_packet. */
  signatureId: string;
  /** chooseLane's decision at signing; its lane must be the lane signed for (else lane_unavailable). */
  decision: LaneDecision;
  actor: 'user' | 'system';
  now: Date;
}

/** filing_enqueue: claim signed -> queued with one open job. Idempotent per signature (created false on a repeat). */
export async function enqueueFiling(
  input: EnqueueFilingInput,
): Promise<{ ok: true; created: boolean; job: FilingJobRecord; claimStatus: string } | JobFailure> {
  const { decision } = input;
  if (!decision?.agent || !isAgentLane(decision.lane) || !decision.channel || decision.channel.type !== decision.lane) {
    return jobFailure('lane_unavailable');
  }
  if (!UUID.test(input.signatureId)) return jobFailure('invalid_request');
  const svc = createServiceClient();
  const { data, error } = await svc.rpc('filing_enqueue', {
    p_signature_id: input.signatureId,
    p_channel: decision.lane,
    p_policy_id: decision.policyId,
    p_due_by: decision.dueBy,
    p_run_after: null,
    p_actor: input.actor,
    p_detail: {},
  });
  if (error) {
    if (error.code === '23505') {
      // Two requests for the same signature: answer with the job that won.
      const { data: existing } = await svc
        .from('claim_filing_jobs')
        .select('*')
        .eq('signature_id', input.signatureId)
        .maybeSingle();
      if (existing) {
        const { data: claim } = await svc.from('claims').select('status').eq('id', existing.claim_id).maybeSingle();
        return { ok: true, created: false, job: existing as FilingJobRecord, claimStatus: String(claim?.status ?? 'queued') };
      }
    }
    return dbJobFailure(error);
  }
  const out = data as { created: boolean; job: FilingJobRecord; claim: { status: string } } | null;
  if (!out?.job) return jobFailure('service_unavailable');
  if (out.created) {
    await notify({
      kind: 'queued',
      claimId: out.job.claim_id,
      userId: out.job.user_id,
      lawsuitId: out.job.lawsuit_id,
      eventId: out.job.id,
      signatureId: out.job.signature_id,
    });
  }
  return { ok: true, created: out.created === true, job: out.job, claimStatus: String(out.claim?.status ?? 'queued') };
}

/**
 * filing_job_claim_next on any channel, locked to `lockOwner`: claim queued
 * -> filing. The desk uses claimNextDeskJob; the cron (worker channels) and
 * the bulk export call this with their own lock owner.
 */
export async function claimNextJob(args: {
  channel: AgentChannel;
  lockOwner: string;
  actor: 'staff' | 'system';
  jobId?: string | null;
  lockMinutes: number;
}): Promise<{ ok: true; job: FilingJobRecord | null; claimStatus: string | null } | JobFailure> {
  if (args.jobId && !UUID.test(args.jobId)) return jobFailure('invalid_request');
  const svc = createServiceClient();
  const { data, error } = await svc.rpc('filing_job_claim_next', {
    p_channel: args.channel,
    p_lock_owner: args.lockOwner,
    p_actor: args.actor,
    p_job_id: args.jobId ?? null,
    p_lock_minutes: args.lockMinutes,
  });
  if (error) return dbJobFailure(error);
  const out = data as { job: FilingJobRecord; claim: { status: string } } | null;
  return { ok: true, job: out?.job ?? null, claimStatus: out?.claim?.status ?? null };
}

/**
 * filing_job_claim_next on filing_desk, locked to staffLockOwner(staff):
 * claim queued -> filing. A given jobId takes that job only. job null when
 * nothing is due. The caller must be a filing_agent and must log take_job.
 */
export async function claimNextDeskJob(input: {
  staff: StaffUser;
  jobId?: string | null;
  now: Date;
}): Promise<{ ok: true; job: FilingJobRecord | null } | JobFailure> {
  if (!canWorkFilingDesk(input.staff)) return jobFailure('role_required');
  const taken = await claimNextJob({
    channel: 'filing_desk',
    lockOwner: staffLockOwner(input.staff),
    actor: 'staff',
    jobId: input.jobId ?? null,
    lockMinutes: DESK_LOCK_MINUTES,
  });
  return taken.ok ? { ok: true, job: taken.job } : taken;
}

/**
 * What happened, as filing_job_finish records it (claim status in brackets):
 *   filed                 with a number [submitted], without [filed_by_claimmatch]
 *   rejected              [filing_rejected]
 *   not_submitted         nothing was sent; back in the queue [queued]
 *   needs_member          nothing was sent; the member must fix something [needs_you]
 *   stopped_at_challenge  a CAPTCHA, code or identity check appeared: stop [self_file]
 *   hand_back_to_member   cannot be filed by Lawsuit AI (deadline cutoff, policy change) [self_file]
 *   needs_attention       unsure whether it went through [unchanged: filing]
 *   exported              in a bulk CSV awaiting the administrator's results [unchanged: filing]
 */
export const FILING_OUTCOMES = [
  'filed',
  'rejected',
  'not_submitted',
  'needs_member',
  'stopped_at_challenge',
  'hand_back_to_member',
  'needs_attention',
  'exported',
] as const;
export type FilingOutcome = (typeof FILING_OUTCOMES)[number];

export interface RecordFilingResultInput {
  jobId: string;
  /** The lock holder ('staff:<uuid>' or 'worker:<run id>'); null only to resolve a needs_attention or exported job. */
  lockOwner: string | null;
  outcome: FilingOutcome;
  confirmationNumber?: string | null;
  evidence?: FilingEvidence[];
  /** Merged into the job's result. Never member answers or secrets. */
  result?: Record<string, unknown>;
  /**
   * Lowercase code; required for rejected, needs_member, hand_back_to_member, needs_attention.
   * It lands in claim_events and claim_signature_voids, which the member can read: use
   * member-safe codes only (never kill_switch, objection_received, administrator_prohibits
   * or anything naming staff); put internal detail in `result` or filing_audit_log.
   */
  reasonCode?: string | null;
  actor: 'staff' | 'system';
  now: Date;
}

interface FinishPlan {
  job: 'filed' | 'rejected' | 'queued' | 'cancelled' | 'needs_attention' | 'exported';
  claim: string | null;
  /** The code the member may read, or (needs_attention, exported) the staff-only code. */
  reason: string | null;
}

/** How an outcome maps onto filing_job_finish. A staff code that is not member-safe stays in result. */
export function planFinish(input: Pick<RecordFilingResultInput, 'outcome' | 'confirmationNumber' | 'reasonCode'>): FinishPlan | null {
  const raw = input.reasonCode ?? null;
  const safe = (fallback: MemberSafeReason) => memberSafeReason(raw, fallback);
  const needsCode = ['rejected', 'needs_member', 'hand_back_to_member', 'needs_attention'].includes(input.outcome);
  if (needsCode && (!raw || !CODE.test(raw))) return null;
  switch (input.outcome) {
    case 'filed':
      return { job: 'filed', claim: input.confirmationNumber?.trim() ? 'submitted' : 'filed_by_claimmatch', reason: null };
    case 'rejected':
      return { job: 'rejected', claim: 'filing_rejected', reason: safe('not_accepted') };
    case 'not_submitted':
      return { job: 'queued', claim: 'queued', reason: 'not_submitted' };
    case 'needs_member':
      return { job: 'cancelled', claim: 'needs_you', reason: safe('more_information_needed') };
    case 'stopped_at_challenge':
      return { job: 'cancelled', claim: 'self_file', reason: 'stopped_at_challenge' };
    case 'hand_back_to_member':
      return { job: 'cancelled', claim: 'self_file', reason: safe('not_offered_for_settlement') };
    case 'needs_attention':
      return { job: 'needs_attention', claim: null, reason: raw };
    case 'exported':
      return { job: 'exported', claim: null, reason: null };
    default:
      return null;
  }
}

const NOTICE_OF: Partial<Record<FilingOutcome, MemberNoticeEvent['kind']>> = {
  filed: 'filed',
  rejected: 'not_accepted',
  needs_member: 'needs_you',
  stopped_at_challenge: 'handed_back',
  hand_back_to_member: 'handed_back',
};

/** filing_job_finish. Notifies the member (transactional email) on filed, needs_member, rejected and hand-backs. */
export async function recordFilingResult(
  input: RecordFilingResultInput,
): Promise<{ ok: true; job: FilingJobRecord; claimStatus: string } | JobFailure> {
  if (!UUID.test(input.jobId)) return jobFailure('invalid_request');
  const plan = planFinish(input);
  if (!plan) return jobFailure('invalid_request');
  const number = plan.job === 'filed' ? input.confirmationNumber?.trim() || null : null;
  const result: Record<string, unknown> = { ...(input.result ?? {}) };
  if (input.reasonCode && input.reasonCode !== plan.reason) result.staff_reason_code = input.reasonCode;

  const svc = createServiceClient();
  const { data, error } = await svc.rpc('filing_job_finish', {
    p_job_id: input.jobId,
    p_lock_owner: input.lockOwner,
    p_job_status: plan.job,
    p_claim_status: plan.claim,
    p_confirmation_number: number,
    p_result: result,
    p_evidence: input.evidence ?? [],
    p_reason: plan.reason,
    p_actor: input.actor,
    p_detail: {},
  });
  if (error) return dbJobFailure(error, { CM005: 'lock_lost' });
  const out = data as { job: FilingJobRecord; claim: { status: string } } | null;
  if (!out?.job) return jobFailure('service_unavailable');

  const kind = NOTICE_OF[input.outcome];
  if (kind) {
    await notify({
      kind,
      claimId: out.job.claim_id,
      userId: out.job.user_id,
      lawsuitId: out.job.lawsuit_id,
      eventId: `${out.job.id}:${input.outcome}`,
      confirmationNumber: number,
      reason: plan.reason,
    });
  }
  return { ok: true, job: out.job, claimStatus: String(out.claim?.status ?? '') };
}

export interface WithdrawFilingInput {
  claimId: string;
  userId: string;
  /**
   * withdrawn: the member stops; self_file: finish on the official site;
   * preparing / ready: reopen to edit; needs_you: the system asks the member.
   */
  to: 'withdrawn' | 'self_file' | 'preparing' | 'ready' | 'needs_you';
  /**
   * Lowercase code stored on the void and the event, which the member can read, so
   * member-safe only: e.g. changed_mind, member_edit, deadline_too_close,
   * not_offered_for_settlement (for a kill switch, objection or policy change).
   */
  reasonCode: string;
  actor: 'user' | 'system' | 'staff';
  now: Date;
}

const WITHDRAW_FALLBACK: Record<WithdrawFilingInput['to'], MemberSafeReason> = {
  withdrawn: 'changed_mind',
  self_file: 'not_offered_for_settlement',
  preparing: 'member_edit',
  ready: 'member_edit',
  needs_you: 'more_information_needed',
};

/**
 * filing_move_claim: cancels the open (queued) job, voids the live signature
 * (if any), reopens or closes the packet and moves the claim, in one step.
 * filing_in_progress while the claim is filing or its job is in_progress,
 * exported or needs_attention (a submission may have happened: only staff end
 * it, through recordFilingResult). The one way any area takes a claim off the
 * agent path before it is filed.
 */
export async function withdrawFiling(
  input: WithdrawFilingInput,
): Promise<
  | { ok: true; changed: boolean; claimStatus: string; jobCancelled: string | null; signatureVoided: string | null }
  | JobFailure
> {
  if (!UUID.test(input.claimId) || !UUID.test(input.userId) || !(input.to in WITHDRAW_FALLBACK)) {
    return jobFailure('invalid_request');
  }
  const reason = memberSafeReason(input.reasonCode, WITHDRAW_FALLBACK[input.to], { trustMemberCode: input.actor === 'user' });
  const svc = createServiceClient();
  const { data, error } = await svc.rpc('filing_move_claim', {
    p_claim_id: input.claimId,
    p_user_id: input.userId,
    p_to_status: input.to,
    p_reason: reason,
    p_actor: input.actor,
    p_detail: {},
  });
  if (error) return dbJobFailure(error);
  const out = data as
    | { changed: boolean; claim: { status: string; lawsuit_id: string }; job_cancelled: string | null; signature_voided: string | null }
    | null;
  if (!out?.claim) return jobFailure('service_unavailable');

  if (out.changed && input.actor !== 'user' && (input.to === 'needs_you' || input.to === 'self_file')) {
    await notify({
      kind: input.to === 'needs_you' ? 'needs_you' : 'handed_back',
      claimId: input.claimId,
      userId: input.userId,
      lawsuitId: out.claim.lawsuit_id,
      eventId: `${input.claimId}:${input.to}:${out.signature_voided ?? out.job_cancelled ?? input.now.toISOString().slice(0, 10)}`,
      reason,
    });
  }
  return {
    ok: true,
    changed: out.changed === true,
    claimStatus: String(out.claim.status),
    jobCancelled: out.job_cancelled ?? null,
    signatureVoided: out.signature_voided ?? null,
  };
}
