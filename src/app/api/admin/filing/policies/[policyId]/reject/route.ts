import { POLICY_SELECT } from '@/lib/filing/channels/policy';
import { RejectRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canApproveFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { dbFail, fail, guard, readBody, reply, routeId } from '../../../_lib/http';
import { policyView } from '../../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/filing/policies/{policyId}/reject: legal_reviewer only; a rejected draft is kept as a record. */
export async function POST(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const auth = await guard(req, canApproveFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'policyId');
  if (!id.ok) return id.res;
  const body = await readBody(req, RejectRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('filing_policies')
    .update({ status: 'rejected', rejected_by: auth.staff.id, rejected_at: new Date().toISOString(), rejection_notes: body.data.notes })
    .eq('id', id.id)
    .eq('status', 'draft')
    .select(POLICY_SELECT)
    .maybeSingle();
  if (error) return dbFail(error);
  if (!data) {
    const { data: exists } = await svc.from('filing_policies').select('id').eq('id', id.id).maybeSingle();
    return fail(exists ? 'not_draft' : 'not_found');
  }
  const row = data as Record<string, unknown>;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'reject_policy',
    lawsuitId: typeof row.lawsuit_id === 'string' ? row.lawsuit_id : null,
    targetTable: 'filing_policies',
    targetId: id.id,
    detail: { version: row.version },
    req,
  });
  return reply({ policy: policyView(row) });
}
