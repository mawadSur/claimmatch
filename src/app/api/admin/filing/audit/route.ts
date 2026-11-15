import { AuditQuerySchema } from '@/lib/filing/v2/contract-staff';
import { canReadFilingAudit } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { fail, guard, offsetOf, readQuery, reply } from '../_lib/http';
import { auditView } from '../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/filing/audit?claim_id=&actor_id=&lawsuit_id=&cursor=&limit= (admin or legal_reviewer), newest first. */
export async function GET(req: Request) {
  const auth = await guard(req, canReadFilingAudit);
  if (!auth.ok) return auth.res;
  const query = readQuery(req, AuditQuerySchema);
  if (!query.ok) return query.res;
  const { claim_id: claimId, actor_id: actorId, lawsuit_id: lawsuitId, cursor, limit } = query.data;
  let lookup = createServiceClient()
    .from('filing_audit_log')
    .select('id, actor_id, actor_roles, action, subject_user_id, claim_id, job_id, lawsuit_id, detail, created_at');
  if (claimId) lookup = lookup.eq('claim_id', claimId);
  if (actorId) lookup = lookup.eq('actor_id', actorId);
  if (lawsuitId) lookup = lookup.eq('lawsuit_id', lawsuitId);
  const offset = offsetOf(cursor);
  const { data, error } = await lookup.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return fail('service_unavailable');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return reply({ entries: rows.map(auditView), next_cursor: rows.length === limit ? String(offset + limit) : null });
}
