import { NextResponse } from 'next/server';
import { claimDue, completeJob, failJob } from '@/lib/jobs';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { authorizeCron } from '@/lib/cron-auth';

// Drains the durable job queue with the service-role client → Node runtime,
// never cached, and long-lived enough to work through a batch.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Generic worker: claim up to 20 due jobs and dispatch each by type. Every job
 * is wrapped so one failure never aborts the batch — it's marked failed (with
 * backoff/retry handled by {@link failJob}) and the drain continues.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const jobs = await claimDue(20);

  for (const job of jobs) {
    try {
      switch (job.type) {
        case 'scrape':
        case 'extract':
        case 'pipeline': {
          const summary = await ingestAndExtract();
          await completeJob(job.id, summary);
          break;
        }
        case 'match':
          // Matching runs in its own sweep (/api/cron/match); nothing to do here.
          await completeJob(job.id, { noop: true });
          break;
        default:
          await failJob(job, `unknown job type: ${job.type}`);
      }
    } catch (err) {
      await failJob(job, err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ processed: jobs.length });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
