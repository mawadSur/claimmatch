import { policyContentOf, POLICY_SELECT } from '@/lib/filing/channels/policy';
import { ApproveRequestSchema } from '@/lib/filing/v2/contract-staff';
import { FilingPolicyContentSchema } from '@/lib/filing/v2/contract-spec';
import { canApproveFilingConfig, recordStaffAccess } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { draftChangedSinceRead } from '../../../_lib/config';
import { dbFail, fail, guard, readBody, reply, routeId, zodFields } from '../../../_lib/http';
import { policyView } from '../../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/filing/policies/{policyId}/approve: legal_reviewer only.
 * The previous approved version of the target is superseded. Records the
 * reviewer, the time, the notes and the documents reviewed (filing_approve_policy).
 * A draft edited after the reviewer read it (expected_updated_at) is refused.
 */
export async function POST(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const auth = await guard(req, canApproveFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'policyId');
  if (!id.ok) return id.res;
  const body = await readBody(req, ApproveRequestSchema);
  if (!body.ok) return body.res;
  const svc = createServiceClient();
  const { data: row } = await svc.from('filing_policies').select(POLICY_SELECT).eq('id', id.id).maybeSingle();
  if (!row) return fail('not_found');
  if (row.status !== 'draft') return fail('not_draft');
  // The approval covers the version the reviewer read, never a later edit.
  const changed = draftChangedSinceRead(row.updated_at, body.data.expected_updated_at);
  if (changed) return changed;
  const content = FilingPolicyContentSchema.safeParse(policyContentOf(row as Record<string, unknown>));
  if (!content.success) return fail('spec_invalid', { fields: zodFields(content.error) });
  const { data, error } = await svc.rpc('filing_approve_policy', {
    p_policy_id: id.id,
    p_reviewer_id: auth.staff.id,
    p_notes: body.data.notes,
    p_documents_reviewed: body.data.documents_reviewed,
  });
  if (error || !data) return dbFail(error);
  const approved = data as Record<string, unknown>;
  await recordStaffAccess({
    staff: auth.staff,
    action: 'approve_policy',
    lawsuitId: typeof approved.lawsuit_id === 'string' ? approved.lawsuit_id : null,
    targetTable: 'filing_policies',
    targetId: id.id,
    detail: {
      version: approved.version,
      agent_filing: approved.agent_filing,
      channels_enabled: content.data.channels.filter((c) => c.enabled).map((c) => c.type),
      documents_reviewed: body.data.documents_reviewed.length,
    },
    req,
  });
  return reply({ policy: policyView(approved) });
}
