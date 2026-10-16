import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Retired. ClaimMatch never handles settlement money and takes no cut, so there
 * are no recoveries to show users.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This feature was removed. ClaimMatch never handles settlement money.', code: 'gone' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
