import { NextResponse } from 'next/server';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { authorizeCron } from '@/lib/cron-auth';
import {
  buildReport,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '../_lib/report';

// Uses the service-role client + Anthropic SDK + source adapters → Node runtime,
// never statically cached, and allowed to run long enough to extract a batch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Manual ingest only (not scheduled). Never matches users or sends email. */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const configProblem = serviceConfigProblem(process.env);
  const step = configProblem
    ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
    : await runStep('pipeline/ingest', ingestAndExtract);
  const report = buildReport('pipeline', { ingest: step });
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
