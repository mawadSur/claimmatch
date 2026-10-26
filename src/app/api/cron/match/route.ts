import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { runMatchSweep } from '@/lib/match-sweep';
import {
  D50_PAUSED,
  buildReport,
  matchSweepGate,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '../_lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Standalone match sweep for manual runs; not scheduled (the daily cron runs
 * the same sweep). Paused by D50 exactly like the daily step: it sends nothing
 * unless MATCH_EMAILS_ENABLED=1.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const gate = matchSweepGate(flags.matchEmails());
  if (!gate.run) {
    return NextResponse.json(
      { ...buildReport('match', { matchSweep: gate.step }), skipped: D50_PAUSED },
      { status: 200 },
    );
  }

  const configProblem = serviceConfigProblem(process.env);
  const step = configProblem
    ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
    : await runStep('match', runMatchSweep);
  const report = buildReport('match', { matchSweep: step });
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
