import { BulkResultsRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canWorkFilingDesk } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { recordBulkResults } from '../../../../_lib/bulk';
import { audited, fail, guard, readBody, reply, routeId } from '../../../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/filing/bulk/exports/{batchId}/results (filing_agent): the
 * administrator's answer for each exported claim (filed, rejected or
 * needs_attention). Logged (record_bulk_results) first.
 */
export async function POST(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await guard(req, canWorkFilingDesk);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'batchId');
  if (!id.ok) return id.res;
  const body = await readBody(req, BulkResultsRequestSchema);
  if (!body.ok) return body.res;
  const blocked = await audited({
    staff: auth.staff,
    action: 'record_bulk_results',
    targetTable: 'filing_export_batches',
    targetId: id.id,
    detail: {
      results: body.data.results.length,
      filed: body.data.results.filter((r) => r.outcome === 'filed').length,
      rejected: body.data.results.filter((r) => r.outcome === 'rejected').length,
    },
    req,
  });
  if (blocked) return blocked;
  const out = await recordBulkResults(createServiceClient(), id.id, body.data.results, new Date());
  if (!out.ok) return fail(out.code);
  return reply({ recorded: out.recorded, failed: out.failed });
}
