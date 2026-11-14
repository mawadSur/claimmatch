/**
 * Resolving a job a person had to look at (POST /jobs/{id}/resolve):
 *   needs_attention: requeue (nothing was sent), filed, rejected, or hand back
 *                    to the member (finish on the official site);
 *   exported:        filed or rejected (the administrator's answer);
 *   filed:           the administrator's late confirmation number (claim
 *                    filed_by_claimmatch -> submitted) or a later refusal
 *                    (-> filing_rejected; the job stays filed).
 */
import { notifyMember } from '@/lib/filing/channels/member-notices';
import { memberSafeReason } from '@/lib/filing/channels/reasons';
import type { FilingJobRecord } from '@/lib/filing/channels/types';
import type { FilingErrorCode } from '@/lib/filing/v2/contract';
import { dbJobFailure, recordFilingResult, type FilingOutcome } from '@/lib/filing/v2/jobs';
import type { StaffUser } from '@/lib/staff-roles';
import type { ServiceClient } from '@/lib/filing/channels/context';

export interface ResolveInput {
  resolution: 'requeue_not_submitted' | 'filed' | 'rejected' | 'hand_back_to_member';
  confirmation_number: string | null;
  reason_code: string;
  notes: string | null;
}

type Resolved = { ok: true; job: FilingJobRecord; claimStatus: string } | { ok: false; code: FilingErrorCode };

const OUTCOME: Record<ResolveInput['resolution'], FilingOutcome> = {
  requeue_not_submitted: 'not_submitted',
  filed: 'filed',
  rejected: 'rejected',
  hand_back_to_member: 'hand_back_to_member',
};

async function resolveFiled(svc: ServiceClient, job: FilingJobRecord, input: ResolveInput): Promise<Resolved> {
  const { data: claim } = await svc.from('claims').select('status').eq('id', job.claim_id).maybeSingle();
  if (claim?.status !== 'filed_by_claimmatch') return { ok: false, code: 'invalid_transition' };
  if (input.resolution === 'filed' && input.confirmation_number) {
    const { data, error } = await svc.rpc('filing_record_confirmation', {
      p_claim_id: job.claim_id,
      p_user_id: job.user_id,
      p_confirmation_number: input.confirmation_number,
      p_actor: 'staff',
      p_detail: {},
    });
    if (error) return dbJobFailure(error);
    const status = String((data as { claim?: { status?: string } } | null)?.claim?.status ?? 'submitted');
    await notifyMember({
      kind: 'filed',
      claimId: job.claim_id,
      userId: job.user_id,
      lawsuitId: job.lawsuit_id,
      eventId: `${job.id}:confirmation`,
      confirmationNumber: input.confirmation_number,
    });
    return { ok: true, job: { ...job, confirmation_number: input.confirmation_number }, claimStatus: status };
  }
  if (input.resolution === 'rejected') {
    const reason = memberSafeReason(input.reason_code, 'not_accepted');
    const { data, error } = await svc.rpc('claim_apply_change', {
      p_claim_id: job.claim_id,
      p_user_id: job.user_id,
      p_expected_status: 'filed_by_claimmatch',
      p_changes: { status: 'filing_rejected' },
      p_actor: 'staff',
      p_detail: { action: 'filing_result', job_id: job.id, job_status: 'filed', reason },
    });
    if (error) return dbJobFailure(error);
    await notifyMember({ kind: 'not_accepted', claimId: job.claim_id, userId: job.user_id, lawsuitId: job.lawsuit_id, eventId: `${job.id}:late_rejection` });
    const status = String((data as { claim?: { status?: string }; status?: string } | null)?.claim?.status ?? 'filing_rejected');
    return { ok: true, job, claimStatus: status };
  }
  return { ok: false, code: 'invalid_transition' };
}

export async function resolveJob(
  svc: ServiceClient,
  staff: StaffUser,
  job: FilingJobRecord,
  input: ResolveInput,
  now: Date,
): Promise<Resolved> {
  if (job.status === 'filed') return resolveFiled(svc, job, input);
  if (job.status !== 'needs_attention' && job.status !== 'exported') return { ok: false, code: 'invalid_transition' };
  const outcome = OUTCOME[input.resolution];
  // An exported claim is with the administrator: only its answer (filed or rejected) closes it.
  if (job.status === 'exported' && (outcome === 'not_submitted' || outcome === 'hand_back_to_member')) {
    return { ok: false, code: 'invalid_transition' };
  }
  const done = await recordFilingResult({
    jobId: job.id,
    lockOwner: null,
    outcome,
    confirmationNumber: outcome === 'filed' ? input.confirmation_number : null,
    reasonCode: input.reason_code,
    result: { resolved_by: staff.id, resolution: input.resolution, notes: input.notes },
    actor: 'staff',
    now,
  });
  return done.ok ? done : { ok: false, code: done.code };
}
