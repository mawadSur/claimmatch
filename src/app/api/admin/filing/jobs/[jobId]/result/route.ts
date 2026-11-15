import { officialDeadline } from '@/lib/filing/channels/context';
import { jobSummary } from '@/lib/filing/channels/desk';
import { RecordResultRequestSchema } from '@/lib/filing/v2/contract-staff';
import { recordFilingResult } from '@/lib/filing/v2/jobs';
import { canWorkFilingDesk, staffLockOwner } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { finalizeEvidence, heldExpiredLock, holdsLock, loadJob } from '../../../_lib/desk';
import { audited, fail, guard, readBody, reply, routeId } from '../../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/jobs/{jobId}/result: what happened on the official
 * site, recorded by the filing_agent holding the lock (RecordResultRequestSchema).
 * filed -> submitted with the number, else filed_by_claimmatch; rejected;
 * not_submitted (back in the queue); needs_member (needs_you); a challenge on
 * the site (stopped_at_challenge: hand back, never solved); needs_attention
 * (unsure: never retried automatically). Logged (record_result) first. A
 * lock that ran out while this staff member was filing still lets them record it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await guard(req, canWorkFilingDesk);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'jobId');
  if (!id.ok) return id.res;
  const body = await readBody(req, RecordResultRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const job = await loadJob(svc, id.id);
  if (!job) return fail('not_found');
  if (!holdsLock(job, auth.staff) && !heldExpiredLock(job, auth.staff)) return fail('lock_lost');
  const now = new Date();
  const evidence = await finalizeEvidence(svc, job, body.data.evidence_document_ids, now);
  if (!evidence.ok) return fail(evidence.code);
  const blocked = await audited({
    staff: auth.staff,
    action: 'record_result',
    subjectUserId: job.user_id,
    claimId: job.claim_id,
    jobId: job.id,
    lawsuitId: job.lawsuit_id,
    targetTable: 'claim_filing_jobs',
    targetId: job.id,
    detail: { outcome: body.data.outcome, reason_code: body.data.reason_code, evidence: evidence.evidence.length },
    req,
  });
  if (blocked) return blocked;
  const done = await recordFilingResult({
    jobId: job.id,
    lockOwner: staffLockOwner(auth.staff),
    outcome: body.data.outcome,
    confirmationNumber: body.data.confirmation_number,
    evidence: evidence.evidence,
    reasonCode: body.data.reason_code,
    result: { recorded_by: auth.staff.id, notes: body.data.notes },
    actor: 'staff',
    now,
  });
  if (!done.ok) return fail(done.code);
  const { data: lawsuit } = await svc.from('lawsuits').select('slug, title, deadline').eq('id', job.lawsuit_id).maybeSingle();
  return reply({
    job: jobSummary(
      done.job,
      { settlementTitle: String(lawsuit?.title ?? 'Settlement'), deadline: lawsuit ? officialDeadline(lawsuit) : null },
      auth.staff,
    ),
    claim: { id: job.claim_id, status: done.claimStatus },
  });
}
