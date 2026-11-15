/**
 * One run of the filing cron (GET /api/cron/filing, and the daily cron on
 * Vercel Hobby). Steps, each bounded and reported on its own:
 *   locks      expired locks -> needs_attention (a person may have submitted)
 *   repair     signed claims without a job: queue them if Jev pre_send passes
 *   handBacks  claims past the cutoff, kill switch, policy or spec change -> self_file
 *   send       worker channels (administrator_email, administrator_api): take a
 *              due job, re-run Jev pre_send, submit; a block is needs_attention
 *   alerts     staff alerts: needs_attention every run, urgent near the deadline
 *   uploads    upload slots older than two hours -> deleted
 *   retention  member uploads past their retention -> deleted
 * Nothing here fills, scrapes or submits an official claim website.
 */
import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { claimNextJob, recordFilingResult, WORKER_LOCK_MINUTES } from '../v2/jobs';
import type { AgentChannel } from '../v2/contract-spec';
import { deadlineOf, loadJobContext, preSendCheck, type ServiceClient, type SettlementFiling } from './context';
import {
  expirePendingUploads,
  expireStaleLocks,
  handBackSweep,
  repairSignedWithoutJob,
  retentionSweep,
  staffAlerts,
} from './cron-sweeps';
import { getChannelAdapter } from './index';
import type { ChannelSubmitResult, FilingJobRecord } from './types';

export const WORKER_CHANNELS: readonly AgentChannel[] = ['administrator_email', 'administrator_api'];
export const MAX_SENDS_PER_RUN = 20;
/**
 * Stop starting new work this long into a run (Vercel Hobby functions stop at
 * 60 seconds). What is left waits for the next run; nothing is half-done, as
 * each step is one database function call per claim or job.
 */
export const SEND_TIME_BUDGET_MS = 40_000;

export type FilingCronStep = { status: 'ran'; result: unknown } | { status: 'failed'; error: string };

export interface FilingCronReport {
  ok: boolean;
  runId: string;
  steps: Record<string, FilingCronStep>;
}

type SendOutcome = 'filed' | 'rejected' | 'needs_attention' | 'requeued' | 'error';

async function finish(job: FilingJobRecord, lockOwner: string, now: Date, res: ChannelSubmitResult): Promise<SendOutcome> {
  const base = { jobId: job.id, lockOwner, actor: 'system' as const, now };
  if (res.status === 'filed') {
    const done = await recordFilingResult({ ...base, outcome: 'filed', confirmationNumber: res.confirmation_number, evidence: res.evidence, result: res.result });
    if (!done.ok) console.error('[filing/cron] sent but not recorded: the lock will expire to needs_attention', { job: job.id, code: done.code });
    return done.ok ? 'filed' : 'error';
  }
  if (res.status === 'rejected') {
    const done = await recordFilingResult({
      ...base,
      outcome: 'rejected',
      reasonCode: res.reason_code,
      evidence: res.evidence,
      result: { detail: res.detail },
    });
    return done.ok ? 'rejected' : 'error';
  }
  if (res.status === 'not_sent' && res.retry_safe) {
    const done = await recordFilingResult({ ...base, outcome: 'not_submitted', result: { not_sent: res.reason_code } });
    return done.ok ? 'requeued' : 'error';
  }
  const reason = res.reason_code;
  const detail = res.status === 'needs_attention' ? res.detail : null;
  const done = await recordFilingResult({ ...base, outcome: 'needs_attention', reasonCode: reason, result: { detail } });
  return done.ok ? 'needs_attention' : 'error';
}

/** One taken job: load and check it, pre_send Jev, then the channel's submit. */
async function sendOne(
  svc: ServiceClient,
  job: FilingJobRecord,
  lockOwner: string,
  now: Date,
  settlements: Map<string, SettlementFiling | null>,
  identities: Map<string, Array<{ user_id: string; key: string }>>,
): Promise<SendOutcome> {
  const attention = (reasonCode: string) =>
    finish(job, lockOwner, now, { status: 'needs_attention', reason_code: reasonCode, detail: null });
  const loaded = await loadJobContext(svc, job, settlements);
  // The settlement's filing configuration (kill switch, objection, policy) could not be read:
  // nothing was sent, so the job waits for the next run instead of a person.
  if (!loaded.ok && loaded.reason === 'settlement_unreadable') {
    return finish(job, lockOwner, now, { status: 'not_sent', reason_code: 'settlement_unreadable', retry_safe: true });
  }
  if (!loaded.ok) return attention(loaded.reason);
  const ctx = loaded.ctx;
  const { result: jev, runId } = await preSendCheck(svc, ctx, now, 'worker', identities);
  if (jev.outcome === 'block') {
    const done = await recordFilingResult({
      jobId: job.id,
      lockOwner,
      outcome: 'needs_attention',
      reasonCode: 'jev_blocked',
      result: { jev_run_id: runId, blocked_rules: jev.issues.filter((i) => i.severity === 'block').map((i) => i.rule_id) },
      actor: 'system',
      now,
    });
    return done.ok ? 'needs_attention' : 'error';
  }
  const config = ctx.settlement.policy.channels.find((c) => c.type === job.channel);
  const adapter = getChannelAdapter(job.channel);
  if (!config || !adapter.submit) return attention(config ? 'channel_not_automatic' : 'channel_not_enabled');
  let res: ChannelSubmitResult;
  try {
    res = await adapter.submit({
      job,
      config: config as never,
      spec: { id: ctx.spec.id, version: ctx.spec.version, content: ctx.spec.content },
      packet: ctx.packet,
      signature: ctx.signature,
      documents: ctx.documents,
      settlement: {
        id: ctx.settlement.lawsuit.id,
        title: ctx.settlement.lawsuit.title,
        deadline: deadlineOf(ctx.settlement.lawsuit, ctx.spec).deadline,
      },
      now,
    });
  } catch (err) {
    // The request may have left our servers: a person decides, nothing is sent again.
    res = { status: 'needs_attention', reason_code: 'submit_error', detail: (err as Error)?.name ?? null };
  }
  return finish(job, lockOwner, now, res);
}

/** Worker channels: at most `maxSends` jobs per run, within the time budget. */
export async function processWorkerChannels(
  svc: ServiceClient,
  opts: { now: Date; runId: string; maxSends: number; budgetMs: number; startedAt: number },
  settlements: Map<string, SettlementFiling | null>,
): Promise<Record<SendOutcome, number> & { taken: number }> {
  const lockOwner = `worker:${opts.runId}`;
  const counts = { taken: 0, filed: 0, rejected: 0, needs_attention: 0, requeued: 0, error: 0 };
  const identities = new Map<string, Array<{ user_id: string; key: string }>>();
  for (const channel of WORKER_CHANNELS) {
    while (counts.taken < opts.maxSends && Date.now() - opts.startedAt < opts.budgetMs) {
      const taken = await claimNextJob({ channel, lockOwner, actor: 'system', lockMinutes: WORKER_LOCK_MINUTES });
      if (!taken.ok) {
        counts.error += 1;
        break;
      }
      if (!taken.job) break;
      counts.taken += 1;
      const outcome = await sendOne(svc, taken.job, lockOwner, opts.now, settlements, identities);
      counts[outcome] += 1;
      // Requeued means nothing could be sent (for example email not configured): try again next run.
      if (outcome === 'requeued') break;
    }
  }
  return counts;
}

async function step(steps: Record<string, FilingCronStep>, name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    steps[name] = { status: 'ran', result: await fn() };
  } catch (err) {
    console.error(`[filing/cron] ${name} failed`, { name: (err as Error)?.name });
    steps[name] = { status: 'failed', error: (err as Error)?.message?.slice(0, 200) || 'failed' };
  }
}

export async function runFilingCron(
  opts: { now?: Date; runId?: string; maxSends?: number; budgetMs?: number } = {},
): Promise<FilingCronReport> {
  const now = opts.now ?? new Date();
  const runId = opts.runId ?? randomUUID();
  const svc = createServiceClient();
  const settlements = new Map<string, SettlementFiling | null>();
  const steps: Record<string, FilingCronStep> = {};
  const startedAt = Date.now();

  const budgetMs = opts.budgetMs ?? SEND_TIME_BUDGET_MS;
  const shouldStop = () => Date.now() - startedAt > budgetMs;

  await step(steps, 'locks', () => expireStaleLocks(svc, now));
  await step(steps, 'repair', () => repairSignedWithoutJob(svc, now, settlements, shouldStop));
  await step(steps, 'handBacks', () => handBackSweep(svc, now, settlements, 100, shouldStop));
  await step(steps, 'send', () =>
    processWorkerChannels(svc, { now, runId, maxSends: opts.maxSends ?? MAX_SENDS_PER_RUN, budgetMs, startedAt }, settlements),
  );
  await step(steps, 'alerts', () => staffAlerts(svc, now));
  await step(steps, 'uploads', () => expirePendingUploads(svc, now));
  await step(steps, 'retention', () => retentionSweep(svc, now));

  return { ok: Object.values(steps).every((s) => s.status === 'ran'), runId, steps };
}
