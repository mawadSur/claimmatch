import { NextResponse } from 'next/server';
import { runAllSources } from '@/lib/scraper';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { recordIngestRun } from '@/lib/jobs';
import {
  buildReport,
  checkIngestStep,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
  type StepResult,
} from '../_lib/report';

export const runtime = 'nodejs';
// Scraping can take a while; keep this off the static edge and long-lived.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manual scrape only (not scheduled). Never matches users or sends email. The
 * same ingest as /api/cron/daily and /api/cron/pipeline, with the same checks:
 * held closures, failed writes and empty sources fail the step (500), and the
 * run is stored as a jobs row for the admin overview.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const configProblem = serviceConfigProblem(process.env);
  let step: StepResult;
  if (configProblem) {
    step = missingConfigStep(configProblem, process.env.NODE_ENV === 'production');
  } else {
    step = checkIngestStep(await runStep('scrape', runAllSources), {
      heldIsWarning: flags.ingestHeldIsWarning(),
    });
    await recordIngestRun('cron/scrape', step);
  }
  const report = buildReport('scrape', { scrape: step });
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
