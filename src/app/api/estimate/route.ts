import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GONE = {
  error: 'This feature was removed. ClaimMatch does not estimate what you could get.',
  code: 'gone',
};

/**
 * Retired. It summed a dollar total from a fixed default amount per match over
 * unfiltered rows, not from amounts the settlements state. Kept as 410 so old
 * open tabs get an answer. Because it computes no matches, it cannot return a
 * past-deadline settlement (the matcher, /api/matches and the daily sweep skip
 * those explicitly).
 */
export async function POST() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  return NextResponse.json(GONE, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
