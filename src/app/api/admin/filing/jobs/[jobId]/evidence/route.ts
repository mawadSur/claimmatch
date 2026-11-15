import { EvidenceUploadRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canWorkFilingDesk } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { createEvidenceSlot, loadJob } from '../../../_lib/desk';
import { fail, guard, readBody, reply, routeId } from '../../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/jobs/{jobId}/evidence: an upload slot for a
 * confirmation screenshot, for the filing_agent holding the job's lock. The
 * file goes to {user_id}/{claim_id}/evidence/, which the member cannot read;
 * it is checked and hashed when the result is recorded.
 */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await guard(req, canWorkFilingDesk);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'jobId');
  if (!id.ok) return id.res;
  const body = await readBody(req, EvidenceUploadRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const job = await loadJob(svc, id.id);
  if (!job) return fail('not_found');
  const slot = await createEvidenceSlot(svc, job, auth.staff, body.data, new Date());
  if (!slot.ok) return fail(slot.code);
  return reply(slot.body, 201);
}
