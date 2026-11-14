import { NextResponse } from 'next/server';
import { BulkExportRequestSchema } from '@/lib/filing/v2/contract-staff';
import { canWorkFilingDesk } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { exportBulk } from '../../_lib/bulk';
import { fail, guard, readBody } from '../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/filing/bulk/exports (filing_agent): the CSV of checked,
 * individually signed claims of one settlement in its administrator's column
 * layout, as text/csv with X-Export-Batch-Id, X-Export-Rows and
 * X-Export-Sha256. Staff upload it to the administrator's portal themselves,
 * then record each claim's result. Logged (export_bulk) before the file.
 */
export async function POST(req: Request) {
  const auth = await guard(req, canWorkFilingDesk, 'bulk_export');
  if (!auth.ok) return auth.res;
  const body = await readBody(req, BulkExportRequestSchema);
  if (!body.ok) return body.res;
  const out = await exportBulk(createServiceClient(), auth.staff, { lawsuitId: body.data.lawsuit_id, maxRows: body.data.max_rows }, req, new Date());
  if (!out.ok) return fail(out.code);
  return new NextResponse(out.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${out.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Export-Batch-Id': out.batchId,
      'X-Export-Rows': String(out.rows),
      'X-Export-Sha256': out.sha256,
      'X-Export-Skipped': String(out.skipped),
    },
  });
}
