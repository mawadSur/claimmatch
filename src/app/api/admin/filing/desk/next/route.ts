import { z } from 'zod';
import { oneClickTestMode } from '@/lib/filing/one-click-access';
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
 * (deskHandBackReason) and the next one is taken. In one-click test mode the
 * desk takes test jobs only: a real job goes straight back to the queue.
 * Outside test mode a test job is never shown: it is handed back to the
 * tester (self_file) and the next job is taken.
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
    if (oneClickTestMode() && job.is_test !== true) {
      await recordFilingResult({ jobId: job.id, lockOwner, outcome: 'not_submitted', actor: 'staff', now });
      return fail('lane_unavailable');
    }
    if (!oneClickTestMode() && job.is_test === true) {
      // A test job left over from test mode is never entered on a real official site:
      // it goes back to the tester (self_file, member-safe reason) and the next job is taken.
      const back = await recordFilingResult({
        jobId: job.id,
        lockOwner,
        outcome: 'hand_back_to_member',
        reasonCode: 'test_job_after_go_live',
        result: { test_job_after_go_live: true },
        actor: 'staff',
        now,
      });
      if (!back.ok) return fail('lane_unavailable');
      if (asked) return reply({ job: null });
      continue;
    }
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
