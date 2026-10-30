import { NextResponse } from 'next/server';
import { authorizeCron, cronRequestIsDryRun } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import {
  failStaleIngestRuns,
  finishIngestRun,
  startIngestRun,
  type IngestRunStep,
} from '@/lib/jobs';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { runMatchSweep } from '@/lib/match-sweep';
import { maybeAlertCronFailure } from '@/lib/cron-alert';
import { maybeRecordIngestAlert } from '@/lib/ingest-alerts';
import { processFilingQueue } from '@/lib/filing/queue';
import { persistEligibilityDrafts } from '@/lib/eligibility-drafts-store';
import { runOfficialLinkCheck } from '@/lib/link-check';
import {
  buildReport,
  checkIngestStep,
  errorMessage,
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
 *      wait for review; no model calls; large closure batches are held). Held
 *      closures, failed writes and empty sources make the step fail (500)
 *      unless INGEST_HELD_IS_WARNING=1 and the only problem is held closures
 *      (then 200 + a warning jobs row). Every run is stored as a jobs row.
 *   2. matchSweep: recompute matches and email new ones. Paused by D50; runs
 *      only when MATCH_EMAILS_ENABLED=1.
 * The JSON reports each step as ran, skipped or failed; any failure makes the
 * response a 500.
 *
 * Observability: a jobs row (status `running`, payload.phase `started`) is
 * written before any feed work. A Hobby timeout or a thrown error leaves that
 * row (failed on catch; still running if the isolate is killed — the next
 * run marks it stale and fires the cron-alert hook).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Declared 300s so a Pro upgrade can use it. Hobby caps this at 10s/60s;
// writes are chunked so a typical SettleSignal night finishes inside that.
export const maxDuration = 300;

function stepToIngestRun(step: StepResult | undefined): IngestRunStep {
  if (!step) return { status: 'failed', error: 'ingest did not run' };
  if (step.status === 'skipped') return { status: 'skipped', reason: step.reason };
  if (step.status === 'ran') return { status: 'ran', result: step.result };
  if (step.status === 'warning') return { status: 'warning', error: step.error, result: step.result };
  return { status: 'failed', error: step.error, result: step.result };
}

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const dryRun = cronRequestIsDryRun(req);
  const stale = await failStaleIngestRuns();
  for (const leftover of stale) {
    await maybeAlertCronFailure({
      job: leftover.trigger.startsWith('cron/') ? leftover.trigger.slice('cron/'.length) : leftover.trigger,
      ok: false,
      failedSteps: ['ingest'],
      steps: {
        ingest: {
          status: 'failed',
          error:
            'Timed out or killed before the run finished (Hobby duration limit or an uncaught crash).',
        },
      },
    });
  }

  const jobId = await startIngestRun('cron/daily', { dryRun });
  console.log('[cron/daily] started', { jobId, dryRun });

  const production = process.env.NODE_ENV === 'production';
  const configProblem = serviceConfigProblem(process.env);
  const steps: Record<string, StepResult> = {};

  try {
    if (configProblem) {
      steps.ingest = missingConfigStep(configProblem, production);
    } else {
      steps.ingest = checkIngestStep(
        await runStep('daily/ingest', () => ingestAndExtract({ dryRun })),
        { heldIsWarning: flags.ingestHeldIsWarning() },
      );
    }
    await maybeRecordIngestAlert('daily', steps.ingest);

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
    await finishIngestRun(jobId, 'cron/daily', stepToIngestRun(steps.ingest));
    await maybeAlertCronFailure(report);
    if (flags.assistedFiling()) {
      await runStep('daily/filing', () => processFilingQueue());
    }
    if (flags.eligibilityDrafts()) {
      await runStep('daily/eligibilityDrafts', () => persistEligibilityDrafts());
    }
    // Hobby allows two crons; the weekly checker piggybacks on Monday UTC.
    if (flags.linkCheck() && new Date().getUTCDay() === 1) {
      await runOfficialLinkCheck();
    }
    return NextResponse.json({ ...report, dryRun, jobId }, { status: reportHttpStatus(report) });
  } catch (err) {
    const error = errorMessage(err);
    console.error('[cron/daily] uncaught:', err);
    if (!steps.ingest) {
      steps.ingest = { status: 'failed', error };
    }
    const report = buildReport('daily', Object.keys(steps).length > 0 ? steps : {
      ingest: { status: 'failed', error },
    });
    await finishIngestRun(jobId, 'cron/daily', { status: 'failed', error });
    await maybeRecordIngestAlert('daily', steps.ingest);
    await maybeAlertCronFailure(report);
    return NextResponse.json({ ...report, dryRun, jobId }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
