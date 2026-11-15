import { ObjectionRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canOpenFilingConsole, canSetObjection, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { setControls } from '../../_lib/config';
import { fail, guard, readBody, reply } from '../../_lib/http';
import { controlsView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/controls/objection. Recording an objection (from an
 * administrator, a court or a party): anyone in the console, effective at
 * once. Clearing it (received_at null): legal_reviewer only.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, ObjectionRequestSchema);
  if (!body.ok) return body.res;
  const clearing = body.data.received_at === null;
  if (!canSetObjection(auth.staff, clearing)) return fail('role_required');
  const saved = await setControls(createServiceClient(), body.data.target, {
    objection_received_at: body.data.received_at,
    objection_notes: body.data.notes,
    objection_changed_by: auth.staff.id,
    objection_changed_at: new Date().toISOString(),
  });
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: clearing ? 'objection_cleared' : 'objection_recorded',
    lawsuitId: 'lawsuit_id' in body.data.target ? body.data.target.lawsuit_id : null,
    targetTable: 'filing_controls',
    targetId: String(saved.row.id),
    detail: 'administrator_id' in body.data.target ? { administrator_id: body.data.target.administrator_id } : {},
    req,
  });
  return reply({ controls: controlsView(saved.row) });
}
