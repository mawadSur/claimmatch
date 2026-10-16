import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error: 'This feature was removed. ClaimMatch does not estimate what you could get.',
  code: 'gone',
};

/**
 * Retired. It summed an invented dollar total, with a made-up default amount
 * per match, over unfiltered rows. Kept as 410 so old open tabs get an answer.
 */
export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
