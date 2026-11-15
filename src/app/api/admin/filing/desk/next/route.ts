import { z } from 'zod';
import { UuidSchema } from '@/lib/filing/v2/contract-spec';
import { claimNextDeskJob, recordFilingResult } from '@/lib/filing/v2/jobs';
import { canWorkFilingDesk, recordStaffAccess, staffLockOwner } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { deskHandBackReason, deskView } from '../../_lib/desk';
import { fail, guard, readBody, reply } from '../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ job_id: UuidSchema.optional() }).strict();

/** Jobs handed straight back in one request before the desk answers with what it has. */
const MAX_HAND_BACKS_PER_TAKE = 5;

/**
 * POST /api/admin/filing/desk/next (filing_agent): take the next due desk job
 * (soonest due first), or the given one, locked to this staff member for 30
 * minutes; claim queued -> filing. Answers the desk screen, or { job: null }
 * when nothing is due. Logged (take_job) before anything is shown; when the
 * log cannot be written the job goes back to the queue (nothing was sent).
 * A job whose pre_send check blocks for good is handed back to the member
 * (deskHandBackReason) and the next one is taken.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canWorkFilingDesk, 'desk_next');
  if (!auth.ok) return auth.res;
  const body = await readBody(req, Body, { allowEmpty: true });
  if (!body.ok) return body.res;
  const now = new Date();
  const lockOwner = staffLockOwner(auth.staff);
  const asked = body.data.job_id ?? null;
  for (let handedBack = 0; handedBack <= MAX_HAND_BACKS_PER_TAKE; handedBack += 1) {
    const taken = await claimNextDeskJob({ staff: auth.staff, jobId: handedBack === 0 ? asked : null, now });
    if (!taken.ok) return fail(taken.code);
    if (!taken.job) return reply({ job: null });
    const job = taken.job;
    const logged = await recordStaffAccess({
      staff: auth.staff,
      action: 'take_job',
      subjectUserId: job.user_id,
      claimId: job.claim_id,
      jobId: job.id,
      lawsuitId: job.lawsuit_id,
      targetTable: 'claim_filing_jobs',
      targetId: job.id,
      req,
    });
    if (!logged) {
      await recordFilingResult({ jobId: job.id, lockOwner, outcome: 'not_submitted', actor: 'staff', now });
      return fail('service_unavailable');
    }
    const view = await deskView(createServiceClient(), job, auth.staff, now, { justTaken: true });
    if (!view.ok) return fail(view.code);
    const reason = deskHandBackReason(view.view.checks);
    if (!reason) return reply({ job: view.view });
    const back = await recordFilingResult({
      jobId: job.id,
      lockOwner,
      outcome: 'hand_back_to_member',
      reasonCode: reason,
      result: { handed_back_on_take: true, blocked_rules: view.view.checks.issues.filter((i) => i.severity === 'block').map((i) => i.rule_id) },
      actor: 'staff',
      now,
    });
    // Could not hand it back: show it, with its block (the screen refuses "filed").
    if (!back.ok) return reply({ job: view.view });
    if (asked) return reply({ job: null });
  }
  return reply({ job: null });
}
