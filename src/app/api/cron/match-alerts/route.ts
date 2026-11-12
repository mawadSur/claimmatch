import { NextResponse } from 'next/server';
import { authorizeCron, cronRequestIsDryRun } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { sendMatchAlerts } from '@/lib/match-alert-job';
import {
  buildReport,
  matchAlertGate,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '../_lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manual / dry-run match-alert job. Not scheduled (Hobby allows two crons);
 * the daily cron runs the same job when MATCH_ALERT_EMAILS_ENABLED=1.
 *
 * ?dryRun=1 plans who would get what without sending, even if the flag is off.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const dryRun = cronRequestIsDryRun(req);
  if (!dryRun) {
    const gate = matchAlertGate(flags.matchAlertEmails());
    if (!gate.run) {
      return NextResponse.json(buildReport('match-alerts', { matchAlerts: gate.step }), { status: 200 });
    }
  }

  const configProblem = serviceConfigProblem(process.env);
  const step = configProblem
    ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
    : await runStep('match-alerts', () => sendMatchAlerts({ dryRun, planWhenOff: dryRun }));
  const report = buildReport('match-alerts', { matchAlerts: step });
  return NextResponse.json({ ...report, dryRun }, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
