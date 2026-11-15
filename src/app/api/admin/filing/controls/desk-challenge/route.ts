import { DeskChallengeRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canApproveFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { setControls } from '../../_lib/config';
import { guard, readBody, reply } from '../../_lib/http';
import { controlsView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/controls/desk-challenge: a settlement's desk
 * challenge rule (0045, founder decision on issue #52). legal_reviewer only,
 * both ways (0045's trigger refuses anyone else loosening it). 'stop' is the
 * default; 'staff_completes_captcha' lets a desk agent complete a CAPTCHA by
 * hand in their own browser, nothing more. Effective at once, audited.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canApproveFilingConfig);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, DeskChallengeRequestSchema);
  if (!body.ok) return body.res;
  const now = new Date().toISOString();
  const saved = await setControls(createServiceClient(), { lawsuit_id: body.data.lawsuit_id }, {
    desk_challenge_mode: body.data.mode,
    desk_challenge_notes: body.data.notes,
    desk_challenge_changed_by: auth.staff.id,
    desk_challenge_changed_at: now,
  });
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'desk_challenge_rule_set',
    lawsuitId: body.data.lawsuit_id,
    targetTable: 'filing_controls',
    targetId: String(saved.row.id),
    detail: { mode: body.data.mode },
    req,
  });
  return reply({ controls: controlsView(saved.row) });
}
