import { RetireSpecRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canApproveFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { retireSpec } from '../../../_lib/config';
import { guard, readBody, reply, routeId } from '../../../_lib/http';
import { specView } from '../../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/filing/specs/{specId}/retire: legal_reviewer only; signed or queued claims on it go back to the member. */
export async function POST(req: Request, { params }: { params: Promise<{ specId: string }> }) {
  const auth = await guard(req, canApproveFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'specId');
  if (!id.ok) return id.res;
  const body = await readBody(req, RetireSpecRequestSchema);
  if (!body.ok) return body.res;
  const retired = await retireSpec(createServiceClient(), auth.staff, id.id, body.data.reason, new Date());
  if (!retired.ok) return retired.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'retire_spec',
    lawsuitId: String(retired.row.lawsuit_id),
    targetTable: 'filing_specs',
    targetId: id.id,
    detail: { version: retired.row.version, claims_returned: retired.returned ?? 0 },
    req,
  });
  return reply({ spec: specView(retired.row), claims_returned: retired.returned ?? 0 });
}
