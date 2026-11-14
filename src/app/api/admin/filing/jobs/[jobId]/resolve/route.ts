import { officialDeadline } from '@/lib/filing/channels/context';
import { jobSummary } from '@/lib/filing/channels/desk';
import { ResolveJobRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canResolveFilingJobs } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { loadJob } from '../../../_lib/desk';
import { audited, fail, guard, readBody, reply, routeId } from '../../../_lib/http';
import { resolveJob } from '../../../_lib/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/jobs/{jobId}/resolve (filing_agent or legal_reviewer):
 * a needs_attention or exported job after a person checked what happened, or
 * a filed job's late confirmation number or later refusal. Logged first (resolve_job).
 */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await guard(req, canResolveFilingJobs);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'jobId');
  if (!id.ok) return id.res;
  const body = await readBody(req, ResolveJobRequestSchema);
  if (!body.ok) return body.res;
  if (body.data.confirmation_number && body.data.resolution !== 'filed') {
    return fail('invalid_request', { fields: [{ path: 'confirmation_number', message: 'Only a filed claim has a confirmation number' }] });
  }
  const svc = createServiceClient();
  const job = await loadJob(svc, id.id);
  if (!job) return fail('not_found');
  const blocked = await audited({
    staff: auth.staff,
    action: 'resolve_job',
    subjectUserId: job.user_id,
    claimId: job.claim_id,
    jobId: job.id,
    lawsuitId: job.lawsuit_id,
    targetTable: 'claim_filing_jobs',
    targetId: job.id,
    detail: { from: job.status, resolution: body.data.resolution, reason_code: body.data.reason_code },
    req,
  });
  if (blocked) return blocked;
  const done = await resolveJob(svc, auth.staff, job, body.data, new Date());
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
