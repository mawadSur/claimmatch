import { UpdatePolicyDraftRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canDraftFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { policyColumns, updateDraft } from '../../_lib/config';
import { guard, readBody, reply, routeId } from '../../_lib/http';
import { policyView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/admin/filing/policies/{policyId}: edit a draft (updated_at guards against lost updates). */
export async function PATCH(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const auth = await guard(req, canDraftFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'policyId');
  if (!id.ok) return id.res;
  const body = await readBody(req, UpdatePolicyDraftRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const saved = await updateDraft(
    svc,
    'filing_policies',
    id.id,
    { ...policyColumns(body.data.content), updated_by: auth.staff.id },
    body.data.updated_at,
  );
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'draft_policy',
    lawsuitId: typeof saved.row.lawsuit_id === 'string' ? saved.row.lawsuit_id : null,
    targetTable: 'filing_policies',
    targetId: id.id,
    detail: { version: saved.row.version },
    req,
  });
  return reply({ policy: policyView(saved.row) });
}
