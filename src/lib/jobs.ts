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
