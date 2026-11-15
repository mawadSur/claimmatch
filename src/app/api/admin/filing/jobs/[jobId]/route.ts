import { canViewMemberFilingData } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { deskView, loadJob } from '../../_lib/desk';
import { audited, fail, guard, reply, routeId } from '../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/filing/jobs/{jobId}: the desk screen for one job (filing_agent
 * or legal_reviewer). The view is logged (view_packet) before it is shown.
 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await guard(req, canViewMemberFilingData);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'jobId');
  if (!id.ok) return id.res;
  const svc = createServiceClient();
  const job = await loadJob(svc, id.id);
  if (!job) return fail('not_found');
  const blocked = await audited({
    staff: auth.staff,
    action: 'view_packet',
    subjectUserId: job.user_id,
    claimId: job.claim_id,
    jobId: job.id,
    lawsuitId: job.lawsuit_id,
    targetTable: 'claim_signatures',
    targetId: job.signature_id,
    req,
  });
  if (blocked) return blocked;
  const view = await deskView(svc, job, auth.staff, new Date());
  if (!view.ok) return fail(view.code);
  return reply({ job: view.view });
}
