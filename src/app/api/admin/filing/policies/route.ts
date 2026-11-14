import { UpsertPolicyDraftRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canDraftFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { upsertPolicyDraft } from '../_lib/config';
import { guard, readBody, reply } from '../_lib/http';
import { policyView } from '../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/policies: create the target's draft, or replace its
 * content. Staff and admins draft; a draft does nothing until a
 * legal_reviewer approves it (the only way agent filing or a channel goes on).
 */
export async function POST(req: Request) {
  const auth = await guard(req, canDraftFilingConfig);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, UpsertPolicyDraftRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const saved = await upsertPolicyDraft(svc, auth.staff, body.data.target, body.data.content, body.data.copy_from_policy_id);
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'draft_policy',
    lawsuitId: 'lawsuit_id' in body.data.target ? body.data.target.lawsuit_id : null,
    targetTable: 'filing_policies',
    targetId: String(saved.row.id),
    detail: { version: saved.row.version },
    req,
  });
  return reply({ policy: policyView(saved.row) });
}
