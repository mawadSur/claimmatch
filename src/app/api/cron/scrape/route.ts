import { NextResponse } from 'next/server';
import { runAllSources } from '@/lib/scraper';
import { authorizeCron } from '@/lib/cron-auth';
import {
  buildReport,
  missingConfigStep,
  reportHttpStatus,
  runStep,
  serviceConfigProblem,
} from '../_lib/report';

export const runtime = 'nodejs';
// Scraping can take a while; keep this off the static edge and long-lived.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Manual scrape only (not scheduled). Never matches users or sends email. */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const configProblem = serviceConfigProblem(process.env);
  const step = configProblem
    ? missingConfigStep(configProblem, process.env.NODE_ENV === 'production')
    : await runStep('scrape', runAllSources);
  const report = buildReport('scrape', { scrape: step });
  return NextResponse.json(report, { status: reportHttpStatus(report) });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
