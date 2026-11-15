import { UpdateSpecDraftRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canDraftFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { specProblems, updateDraft } from '../../_lib/config';
import { fail, guard, readBody, reply, routeId } from '../../_lib/http';
import { specView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/admin/filing/specs/{specId}: edit a draft spec (updated_at guards against lost updates). */
export async function PATCH(req: Request, { params }: { params: Promise<{ specId: string }> }) {
  const auth = await guard(req, canDraftFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'specId');
  if (!id.ok) return id.res;
  const body = await readBody(req, UpdateSpecDraftRequestSchema);
  if (!body.ok) return body.res;
  const problems = specProblems(body.data.content);
  if (problems.length) return fail('spec_invalid', { fields: problems });
  const saved = await updateDraft(
    createServiceClient(),
    'filing_specs',
    id.id,
    { content: body.data.content, updated_by: auth.staff.id },
    body.data.updated_at,
  );
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'draft_spec',
    lawsuitId: String(saved.row.lawsuit_id),
    targetTable: 'filing_specs',
    targetId: id.id,
    detail: { version: saved.row.version },
    req,
  });
  return reply({ spec: specView(saved.row) });
}
