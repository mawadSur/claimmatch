import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { runMatchSweep } from '@/lib/match-sweep';

/**
 * Consolidated daily cron: runs the ingest pipeline followed by the match sweep.
 * Combines what was previously two separate crons (pipeline + match) into one
 * to stay within Vercel Hobby's 2-cron limit.
 *
 * Schedule: daily at 06:00 UTC
 *   1. Ingest: fetch from all SOURCE_ADAPTERS, extract via LLM (if configured),
 *      upsert lawsuits with review gating.
 *   2. Match sweep: recompute matches for opted-in users and email them about
 *      brand-new matches (notified_at IS NULL).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const results: {
    ingest?: Awaited<ReturnType<typeof ingestAndExtract>>;
    ingestError?: string;
    match?: Awaited<ReturnType<typeof runMatchSweep>>;
    matchError?: string;
  } = {};

  // Step 1: Ingest pipeline
  try {
    results.ingest = await ingestAndExtract();
  } catch (err) {
    console.error('[cron/daily] ingest failed:', err);
    results.ingestError = err instanceof Error ? err.message : 'Ingest failed.';
  }

  // Step 2: Match sweep (run even if ingest failed — there may be existing lawsuits)
  try {
    results.match = await runMatchSweep();
  } catch (err) {
    console.error('[cron/daily] match sweep failed:', err);
    results.matchError = err instanceof Error ? err.message : 'Match sweep failed.';
  }

  const hasError = results.ingestError || results.matchError;
  return NextResponse.json(results, { status: hasError ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
