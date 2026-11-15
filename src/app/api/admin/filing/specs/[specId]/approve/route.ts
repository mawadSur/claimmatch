import { ApproveRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canApproveFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { checkSpec, draftChangedSinceRead } from '../../../_lib/config';
import { dbFail, fail, guard, readBody, reply, routeId } from '../../../_lib/http';
import { specView } from '../../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/specs/{specId}/approve: legal_reviewer only. The
 * draft is checked again (schema, Jev rules, time zone), then approved; the
 * previous approved version is superseded (filing_approve_spec). Open packets
 * move to it on their next save. A draft edited after the reviewer read it
 * (expected_updated_at) is refused.
 */
export async function POST(req: Request, { params }: { params: Promise<{ specId: string }> }) {
  const auth = await guard(req, canApproveFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'specId');
  if (!id.ok) return id.res;
  const body = await readBody(req, ApproveRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const { data: row } = await svc.from('filing_specs').select('id, lawsuit_id, status, content, updated_at').eq('id', id.id).maybeSingle();
  if (!row) return fail('not_found');
  if (row.status !== 'draft') return fail('not_draft');
  // The approval covers the version the reviewer read, never a later edit.
  const changed = draftChangedSinceRead(row.updated_at, body.data.expected_updated_at);
  if (changed) return changed;
  const checked = checkSpec(row.content);
  if (!checked.ok) return fail('spec_invalid', { fields: checked.fields });
  const { data, error } = await svc.rpc('filing_approve_spec', {
    p_spec_id: id.id,
    p_reviewer_id: auth.staff.id,
    p_notes: body.data.notes,
    p_documents_reviewed: body.data.documents_reviewed,
  });
  if (error || !data) return dbFail(error);
  const approved = data as Record<string, unknown>;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'approve_spec',
    lawsuitId: String(row.lawsuit_id),
    targetTable: 'filing_specs',
    targetId: id.id,
    detail: { version: approved.version, documents_reviewed: body.data.documents_reviewed.length },
    req,
  });
  return reply({ spec: specView(approved) });
}
