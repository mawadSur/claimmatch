import { CreateSpecDraftRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canDraftFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { checkSpec, upsertSpecDraft } from '../_lib/config';
import { fail, guard, readBody, reply } from '../_lib/http';
import { specView } from '../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/specs: a draft version of a settlement's spec, from
 * the given content or copied from one of its versions (an existing draft's
 * content is replaced). Checked with the schema, validateJevRules and the
 * time-zone rule; only a legal_reviewer approves it.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canDraftFilingConfig);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, CreateSpecDraftRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  let content: unknown = body.data.content;
  if (body.data.copy_from_spec_id) {
    const { data: source } = await svc
      .from('filing_specs')
      .select('content')
      .eq('id', body.data.copy_from_spec_id)
      .eq('lawsuit_id', body.data.lawsuit_id)
      .maybeSingle();
    if (!source) return fail('invalid_request', { fields: [{ path: 'copy_from_spec_id', message: 'Not a spec of this settlement' }] });
    content = source.content;
  }
  const checked = checkSpec(content);
  if (!checked.ok) return fail('spec_invalid', { fields: checked.fields });
  const saved = await upsertSpecDraft(svc, auth.staff, body.data.lawsuit_id, checked.content);
  if (!saved.ok) return saved.res;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'draft_spec',
    lawsuitId: body.data.lawsuit_id,
    targetTable: 'filing_specs',
    targetId: String(saved.row.id),
    detail: { version: saved.row.version, copied: Boolean(body.data.copy_from_spec_id) },
    req,
  });
  return reply({ spec: specView(saved.row) });
}
