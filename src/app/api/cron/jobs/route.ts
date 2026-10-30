import { NextResponse } from 'next/server';
import { claimDue, completeJob, failJob, recordIngestRun } from '@/lib/jobs';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { authorizeCron } from '@/lib/cron-auth';
import { flags } from '@/lib/flags';
import type { Job } from '@/lib/types';
import {
  buildReport,
  checkIngestStep,
  errorMessage,
  missingConfigStep,
  reportHttpStatus,
  serviceConfigProblem,
  type StepResult,
} from '../_lib/report';

// Drains the durable job queue with the service-role client → Node runtime,
// never cached, and long-lived enough to work through a batch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Generic worker (not scheduled): claim up to 20 due jobs and dispatch each by
 * type. One failure never aborts the batch: the job is marked failed (with
 * backoff and retry in {@link failJob}) and the drain continues. Each job is
 * reported as a step; any failure makes the response a 500.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const configProblem = serviceConfigProblem(process.env);
  if (configProblem) {
    const report = buildReport('jobs', {
      claim: missingConfigStep(configProblem, process.env.NODE_ENV === 'production'),
    });
    return NextResponse.json({ ...report, claimed: 0 }, { status: reportHttpStatus(report) });
  }

  let jobs: Job[];
  try {
    jobs = await claimDue(20);
  } catch (err) {
    console.error('[cron/jobs] claim failed:', err);
    const report = buildReport('jobs', { claim: { status: 'failed', error: errorMessage(err) } });
    return NextResponse.json({ ...report, claimed: 0 }, { status: reportHttpStatus(report) });
  }

  const steps: Record<string, StepResult> = {};
  for (const job of jobs) {
    const key = `${job.type}:${job.id}`;
    try {
      steps[key] = await processJob(job);
    } catch (err) {
      console.error(`[cron/jobs] ${key} failed:`, err);
      const error = errorMessage(err);
      try {
        await failJob(job, error);
      } catch (markErr) {
        console.error(`[cron/jobs] could not mark ${key} failed:`, markErr);
      }
      steps[key] = { status: 'failed', error };
    }
  }

  const report = buildReport('jobs', steps);
  return NextResponse.json({ ...report, claimed: jobs.length }, { status: reportHttpStatus(report) });
}

/** Run one job. Throws on failure; the caller records it and marks the job failed. */
async function processJob(job: Job): Promise<StepResult> {
  switch (job.type) {
    case 'scrape':
    case 'extract':
    case 'pipeline': {
      // A throw is retried (failJob). Otherwise the same checks and run record
      // as the cron routes: held closures, failed writes and empty sources
      // fail the step, and the run is stored for the admin overview.
      const summary = await ingestAndExtract();
      const step = checkIngestStep(
        { status: 'ran', result: summary },
        { heldIsWarning: flags.ingestHeldIsWarning() },
      );
      await recordIngestRun(`cron/jobs:${job.type}`, step);
      await completeJob(job.id, summary);
      return step;
    }
    case 'match':
      // Never runs the sweep or sends email. The sweep runs only from
      // /api/cron/daily, where D50 pauses it.
      await completeJob(job.id, { noop: true });
      return {
        status: 'skipped',
        reason: 'match jobs do nothing; the match sweep runs only from /api/cron/daily',
      };
    default:
      throw new Error(`unknown job type: ${job.type}`);
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
