import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { runMatchSweep } from '@/lib/match-sweep';
import {
  buildReport,
  matchSweepGate,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
  type StepResult,
} from '../_lib/report';

/**
 * Daily cron (06:00 UTC, vercel.json). Vercel Hobby allows two crons, so this
 * one route runs the daily steps in order:
 *   1. ingest: fetch every source adapter and refresh the catalog (new records
 *      wait for review; no model calls; large closure batches are held).
 *   2. matchSweep: recompute matches and email new ones. Paused by D50; runs
 *      only when MATCH_EMAILS_ENABLED=1.
 * The JSON reports each step as ran, skipped or failed; any failure makes the
 * response a 500.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const production = process.env.NODE_ENV === 'production';
  const configProblem = serviceConfigProblem(process.env);
  const steps: Record<string, StepResult> = {};

  steps.ingest = configProblem
    ? missingConfigStep(configProblem, production)
    : await runStep('daily/ingest', ingestAndExtract);

  const gate = matchSweepGate(flags.matchEmails());
  if (!gate.run) {
    steps.matchSweep = gate.step;
  } else {
    // Runs even if ingest failed: existing settlements can still match.
    steps.matchSweep = configProblem
      ? missingConfigStep(configProblem, production)
      : await runStep('daily/matchSweep', runMatchSweep);
  }

  const report = buildReport('daily', steps);
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
