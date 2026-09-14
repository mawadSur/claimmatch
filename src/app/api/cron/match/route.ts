import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { runMatchSweep } from '@/lib/match-sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Standalone match sweep endpoint. Still available for manual smoke tests,
 * but daily cron now uses /api/cron/daily which runs ingest + match together.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await runMatchSweep();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/match] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Match sweep failed.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
