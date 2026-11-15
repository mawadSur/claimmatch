import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error: 'This way of signing up a claim was retired. Open the claim page to finish your claim.',
  code: 'gone',
};

/**
 * Retired, like /api/claims/file-all. The legacy assisted-filing route (0015)
 * trusted the client: any settlement, any claim id, a re-sign that overwrote
 * the earlier record and a job queue that could file twice. One-click filing
 * (/api/filing/claims/**, ONE_CLICK_FILING_ENABLED) replaces it, with a
 * signature bound to the exact packet. Nothing is stored or queued here.
 */
export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
