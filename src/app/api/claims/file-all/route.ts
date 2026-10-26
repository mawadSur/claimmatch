import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error:
    'This feature was removed. ClaimMatch does not file claims for you. Open each settlement, file on its official site, then tell us you filed.',
  code: 'gone',
};

/** Retired. File-all marked claims as filed although nothing was filed. */
export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
