import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Retired. ClaimMatch no longer marks claims submitted in bulk. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This action is no longer available. Prepare a claim packet for each settlement, then submit on the official site.',
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({ error: 'Gone.' }, { status: 410 });
}
