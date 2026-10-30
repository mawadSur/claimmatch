import { NextResponse } from 'next/server';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import { maybeAlertCronFailure } from '@/lib/cron-alert';
import { maybeRecordIngestAlert } from '@/lib/ingest-alerts';
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

// Uses the service-role client + Anthropic SDK + source adapters → Node runtime,
// never statically cached, and allowed to run long enough to extract a batch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Manual ingest only (not scheduled). Never matches users or sends email. Like
 * the daily cron, held closures, failed writes and empty sources fail the step,
 * and the run is stored as a jobs row.
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
    step = checkIngestStep(await runStep('pipeline/ingest', ingestAndExtract), {
      heldIsWarning: flags.ingestHeldIsWarning(),
    });
    await recordIngestRun('cron/pipeline', step);
    await maybeRecordIngestAlert('pipeline', step);
  }
  const report = buildReport('pipeline', { ingest: step });
  await maybeAlertCronFailure(report);
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
