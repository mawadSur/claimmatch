import { KillSwitchRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canOpenFilingConsole, canSetKillSwitch, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { setControls } from '../../_lib/config';
import { fail, guard, readBody, reply } from '../../_lib/http';
import { controlsView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/controls/kill-switch. On: anyone in the console,
 * effective at once (queued claims go back to the member on the next cron
 * run; pre_send checks block). Off: legal_reviewer only (0038 checks it too).
 */
export async function POST(req: Request) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, KillSwitchRequestSchema);
  if (!body.ok) return body.res;
  if (!canSetKillSwitch(auth.staff, body.data.active)) return fail('role_required');
  const now = new Date().toISOString();
  const saved = await setControls(createServiceClient(), body.data.target, {
    kill_switch: body.data.active,
    kill_switch_reason: body.data.reason,
    kill_switch_changed_by: auth.staff.id,
    kill_switch_changed_at: now,
  });
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: body.data.active ? 'kill_switch_on' : 'kill_switch_off',
    lawsuitId: 'lawsuit_id' in body.data.target ? body.data.target.lawsuit_id : null,
    targetTable: 'filing_controls',
    targetId: String(saved.row.id),
    detail: 'administrator_id' in body.data.target ? { administrator_id: body.data.target.administrator_id } : {},
    req,
  });
  return reply({ controls: controlsView(saved.row) });
}
