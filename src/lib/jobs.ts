import { createServiceClient } from '@/lib/supabase/server';
import type { Job } from './types';

/**
 * Durable job queue backed by the `jobs` table. The scrape/extract/match/notify
 * workers enqueue and drain jobs through here using the service-role client
 * (bypasses RLS). Idempotent-friendly: workers should tolerate re-runs.
 *
 * This is intentionally simple (SELECT + UPDATE lock via locked_at) rather than
 * pulling in an external queue — good enough for cron-driven batch processing
 * and swappable for Inngest/QStash later.
 */

function configured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function enqueue(
  type: Job['type'],
  payload: Record<string, unknown> = {},
  opts: { runAfter?: Date; maxAttempts?: number } = {},
): Promise<string | null> {
  if (!configured()) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      type,
      payload,
      run_after: (opts.runAfter ?? new Date()).toISOString(),
      max_attempts: opts.maxAttempts ?? 3,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[jobs] enqueue failed:', error);
    return null;
  }
  return data.id as string;
}

/** Claim up to `limit` due jobs and mark them running. */
export async function claimDue(limit = 10): Promise<Job[]> {
  if (!configured()) return [];
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'queued')
    .lte('run_after', nowIso)
    .order('run_after', { ascending: true })
    .limit(limit);

  const jobs = (due ?? []) as Job[];
  const claimed: Job[] = [];
  for (const job of jobs) {
    const { data: updated } = await supabase
      .from('jobs')
      .update({ status: 'running', locked_at: nowIso, attempts: job.attempts + 1 })
      .eq('id', job.id)
      .eq('status', 'queued') // optimistic guard against a double-claim
      .select('*')
      .maybeSingle();
    if (updated) claimed.push(updated as Job);
  }
  return claimed;
}

/**
 * In-progress ingest marker stored on `jobs.payload.phase`. The `jobs.status`
 * enum is queued|running|done|failed (0002); we use `running` for "started"
 * so the nightly cron can record a row before any feed work without a
 * production migration. A killed Hobby run leaves this row visible.
 */
export const INGEST_STARTED_PHASE = 'started';

/** A running ingest older than this is treated as killed (Hobby duration). */
export const STALE_INGEST_MS = 15 * 60 * 1000;

export type IngestRunStep =
  | { status: 'ran'; result: unknown }
  | { status: 'failed'; error: string; result?: unknown }
  | { status: 'skipped'; reason?: string };

/**
 * Insert a running jobs row at the very start of an ingest handler, before
 * any feed fetch or catalog write. Returns the row id, or null if the write
 * could not happen. Never throws.
 */
export async function startIngestRun(
  trigger: string,
  extra: Record<string, unknown> = {},
): Promise<string | null> {
  if (!configured()) return null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        type: 'pipeline',
        status: 'running',
        payload: { trigger, phase: INGEST_STARTED_PHASE, ...extra },
        attempts: 1,
        result: null,
        error: null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[jobs] could not start the ingest run:', error.message);
      return null;
    }
    return typeof data?.id === 'string' ? data.id : null;
  } catch (err) {
    console.error('[jobs] could not start the ingest run:', err);
    return null;
  }
}

/**
 * Mark the started row done or failed. Falls back to inserting a new row
 * (recordIngestRun) when the id is missing. Never throws. A skipped step is
 * left as the started row with a skipped payload so it stays visible.
 */
export async function finishIngestRun(
  jobId: string | null,
  trigger: string,
  step: IngestRunStep,
): Promise<void> {
  if (!configured()) return;
  if (step.status === 'skipped') {
    if (!jobId) return;
    try {
      const supabase = createServiceClient();
      await supabase
        .from('jobs')
        .update({
          status: 'done',
          payload: { trigger, phase: 'skipped' },
          result: { skipped: true, reason: step.reason ?? 'skipped' },
          error: null,
          locked_at: null,
        })
        .eq('id', jobId);
    } catch (err) {
      console.error('[jobs] could not mark the ingest run skipped:', err);
    }
    return;
  }
  if (!jobId) {
    await recordIngestRun(trigger, step);
    return;
  }
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('jobs')
      .update({
        status: step.status === 'ran' ? 'done' : 'failed',
        payload: { trigger, phase: step.status === 'ran' ? 'finished' : 'failed' },
        result: step.result ?? null,
        error: step.status === 'failed' ? step.error : null,
        locked_at: null,
      })
      .eq('id', jobId);
    if (error) {
      console.error('[jobs] could not finish the ingest run:', error.message);
      await recordIngestRun(trigger, step);
    }
  } catch (err) {
    console.error('[jobs] could not finish the ingest run:', err);
    await recordIngestRun(trigger, step);
  }
}

/**
 * Mark leftover running ingest rows as failed. A Hobby timeout or a crash
 * after startIngestRun leaves status=running; the next cron (or a manual
 * trigger) closes those so /admin is never silent. Returns how many rows
 * were flipped. Never throws.
 */
export async function failStaleIngestRuns(
  opts: { olderThanMs?: number; now?: Date } = {},
): Promise<{ id: string; trigger: string }[]> {
  if (!configured()) return [];
  const olderThanMs = opts.olderThanMs ?? STALE_INGEST_MS;
  const cutoff = new Date((opts.now ?? new Date()).getTime() - olderThanMs).toISOString();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('jobs')
      .select('id, payload, created_at')
      .eq('type', 'pipeline')
      .eq('status', 'running')
      .lte('created_at', cutoff)
      .limit(20);
    if (error || !data) return [];
    const flipped: { id: string; trigger: string }[] = [];
    for (const row of data as Array<{ id: string; payload: unknown }>) {
      const payload =
        row.payload && typeof row.payload === 'object'
          ? (row.payload as { trigger?: string; phase?: string })
          : {};
      const trigger = typeof payload.trigger === 'string' ? payload.trigger : 'cron/daily';
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error:
            'Timed out or killed before the run finished (Hobby duration limit or an uncaught crash).',
          payload: { ...payload, phase: 'stale' },
          locked_at: null,
        })
        .eq('id', row.id)
        .eq('status', 'running');
      if (!updateError) flipped.push({ id: row.id, trigger });
    }
    return flipped;
  } catch (err) {
    console.error('[jobs] could not fail stale ingest runs:', err);
    return [];
  }
}

/**
 * Keeps a record of one ingest run as a `jobs` row: type 'pipeline', status
 * 'done' or 'failed' (never 'queued', so the worker never runs it again), the
 * full summary in `result` (every held closure with its changes) and the
 * problems in `error`. The admin overview shows the latest one. A skipped run
 * is not recorded. Never throws: a run record must not break the cron.
 */
export async function recordIngestRun(
  trigger: string,
  step:
    | { status: 'ran'; result: unknown }
    | { status: 'failed'; error: string; result?: unknown }
    | { status: 'skipped' },
): Promise<void> {
  if (!configured() || step.status === 'skipped') return;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('jobs').insert({
      type: 'pipeline',
      status: step.status === 'ran' ? 'done' : 'failed',
      payload: { trigger },
      attempts: 1,
      result: step.result ?? null,
      error: step.status === 'failed' ? step.error : null,
    });
    if (error) console.error('[jobs] could not record the ingest run:', error.message);
  } catch (err) {
    console.error('[jobs] could not record the ingest run:', err);
  }
}

/**
 * Record a failed cron (digest, etc.) as a jobs row so /admin can show it.
 * Never throws: a run record must not break the cron.
 */
export async function recordCronFailure(trigger: string, error: string): Promise<void> {
  if (!configured()) return;
  try {
    const supabase = createServiceClient();
    const { error: writeError } = await supabase.from('jobs').insert({
      type: trigger.includes('digest') ? 'notify' : 'pipeline',
      status: 'failed',
      payload: { trigger },
      attempts: 1,
      error,
    });
    if (writeError) console.error('[jobs] could not record the cron failure:', writeError.message);
  } catch (err) {
    console.error('[jobs] could not record the cron failure:', err);
  }
}

export async function completeJob(id: string, result: Record<string, unknown>): Promise<void> {
  if (!configured()) return;
  const supabase = createServiceClient();
  await supabase.from('jobs').update({ status: 'done', result }).eq('id', id);
}

export async function failJob(job: Job, error: string): Promise<void> {
  if (!configured()) return;
  const supabase = createServiceClient();
  const exhausted = job.attempts >= job.max_attempts;
  await supabase
    .from('jobs')
    .update({
      status: exhausted ? 'failed' : 'queued',
      error,
      // simple linear backoff on retry
      run_after: exhausted
        ? job.run_after
        : new Date(Date.now() + 60_000 * job.attempts).toISOString(),
      locked_at: null,
    })
    .eq('id', job.id);
}
