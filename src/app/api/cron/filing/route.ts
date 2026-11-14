import { NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { FILING_ERROR_MESSAGES } from '@/lib/filing/v2/contract';
import { flags } from '@/lib/flags';
import { serviceConfigProblem } from '../_lib/report';

/**
 * GET /api/cron/filing: one run of the one-click filing cron
 * (src/lib/filing/channels/cron.ts): expired locks, signed claims without a
 * job, hand-backs, worker-channel sends, staff alerts, expired uploads and
 * document retention. CRON_SECRET as the other cron routes. With
 * ONE_CLICK_FILING_ENABLED off it answers 404 before auth or any read.
 * Any failed step makes the answer a 500 (never a silent 200).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store' };

async function handle(req: Request) {
  if (!flags.oneClickFiling()) {
    return NextResponse.json({ error: FILING_ERROR_MESSAGES.not_found, code: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });
  }
  const problem = serviceConfigProblem(process.env);
  if (problem) {
    // As the other cron routes: a failure in production, a skip elsewhere (local, preview).
    const production = process.env.NODE_ENV === 'production';
    return NextResponse.json(
      { job: 'filing', ok: !production, skipped: problem },
      { status: production ? 500 : 200, headers: NO_STORE },
    );
  }
  const { runFilingCron } = await import('@/lib/filing/channels/cron');
  const report = await runFilingCron();
  return NextResponse.json({ job: 'filing', ...report }, { status: report.ok ? 200 : 500, headers: NO_STORE });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
