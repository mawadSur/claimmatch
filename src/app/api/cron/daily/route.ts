import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { runMatchSweep } from '@/lib/match-sweep';
import { runCloseJob } from '@/lib/close-job';

/**
 * Consolidated daily cron: close expired rows, ingest, then match.
 * Schedule: daily at 06:00 UTC
 *   1. Close job: past-deadline rows + SettleSignal feed reconciliation.
 *   2. Ingest: SOURCE_ADAPTERS + LLM extract, last_verified_at on upsert.
 *   3. Match sweep: recompute matches for opted-in users.
 *
 * Catalog dates use UTC calendar days (see todayISO).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const results: {
    close?: Awaited<ReturnType<typeof runCloseJob>>;
    closeError?: string;
    ingest?: Awaited<ReturnType<typeof ingestAndExtract>>;
    ingestError?: string;
    match?: Awaited<ReturnType<typeof runMatchSweep>>;
    matchError?: string;
  } = {};

  try {
    results.close = await runCloseJob();
  } catch (err) {
    console.error('[cron/daily] close job failed:', err);
    results.closeError = err instanceof Error ? err.message : 'Close job failed.';
  }

  try {
    results.ingest = await ingestAndExtract();
  } catch (err) {
    console.error('[cron/daily] ingest failed:', err);
    results.ingestError = err instanceof Error ? err.message : 'Ingest failed.';
  }

  try {
    results.match = await runMatchSweep();
  } catch (err) {
    console.error('[cron/daily] match sweep failed:', err);
    results.matchError = err instanceof Error ? err.message : 'Match sweep failed.';
  }

  const hasError = results.closeError || results.ingestError || results.matchError;
  return NextResponse.json(results, { status: hasError ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
