import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error: 'This export was retired. Bulk exports of signed one-click claims are in the filing console.',
  code: 'gone',
};

/**
 * Retired. It exported every claim_authorizations row of a settlement with
 * the member's profile, but members could insert those rows themselves until
 * 0037, the profiles embed had no foreign key to resolve, withdrawn claims
 * were not filtered, cells were not guarded against spreadsheet formulas and
 * the access was never logged. The administrator_bulk channel
 * (/api/admin/filing/bulk/exports) replaces it: individually signed, Jev-checked
 * claims, a batch record and an audit row per export.
 */
export async function GET() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
