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
 *
 * Test mode (ONE_CLICK_FILING_TEST_MODE with ONE_CLICK_FILING_ENABLED off):
 * the run first checks that every one-click row belongs to the test (no real
 * job, no packet of anyone outside INTERNAL_EMAILS). If not, no step runs and
 * the run fails loudly: real members' claims are never touched in test mode.
 */
import { randomUUID } from 'node:crypto';
import { isInternalEmail } from '@/lib/internal-users';
import { createServiceClient } from '@/lib/supabase/server';
import { oneClickTestMode } from '../one-click-access';
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
import { archiveRetentionSweep, pruneJevPartialRuns } from '../retention';
import { getChannelAdapter } from './index';
import { sandboxFor, testItem } from './test-mode';
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
  // Test mode and test items (./test-mode.ts): the test inbox only, never an administrator.
  const sandbox = sandboxFor(testItem(job, ctx.packetRow), job.channel, () => ctx.packet.member.email);
  if (sandbox.kind === 'refused') return finish(job, lockOwner, now, sandbox.result);
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
      ...(sandbox.kind === 'sandboxed' ? { sandbox: sandbox.sandbox } : {}),
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

/** Packets read per test-mode check; more than this is not a test. */
export const TEST_MODE_MAX_PACKETS = 500;

/**
 * Test mode only: null when every one-click row is test data, else why not.
 * Reads job flags and packet owners' emails only.
 */
export async function testModePreflight(svc: ServiceClient): Promise<string | null> {
  const realJob = await svc.from('claim_filing_jobs').select('id').eq('is_test', false).limit(1);
  if (realJob.error) return 'test_mode_check_failed';
  if ((realJob.data ?? []).length > 0) return 'real_filing_jobs_present';
  const packets = await svc.from('claim_packets').select('user_id').limit(TEST_MODE_MAX_PACKETS + 1);
  if (packets.error) return 'test_mode_check_failed';
  const owners = [...new Set(((packets.data ?? []) as Array<{ user_id: string }>).map((p) => p.user_id))];
  if ((packets.data ?? []).length > TEST_MODE_MAX_PACKETS) return 'real_packets_present';
  if (owners.length === 0) return null;
  const profiles = await svc.from('profiles').select('id, email').in('id', owners);
  if (profiles.error) return 'test_mode_check_failed';
  const emails = new Map(((profiles.data ?? []) as Array<{ id: string; email: string | null }>).map((p) => [p.id, p.email]));
  return owners.every((id) => isInternalEmail(emails.get(id))) ? null : 'real_packets_present';
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

  if (oneClickTestMode()) {
    let blocked: string | null = 'test_mode_check_failed';
    try {
      blocked = await testModePreflight(svc);
    } catch {
      // blocked stays set: nothing runs.
    }
    if (blocked) {
      console.error('[filing/cron] test mode: refused to run', { reason: blocked });
      return { ok: false, runId, steps: { testMode: { status: 'failed', error: blocked } } };
    }
    steps.testMode = { status: 'ran', result: { onlyTestData: true } };
  }

  await step(steps, 'locks', () => expireStaleLocks(svc, now));
  await step(steps, 'repair', () => repairSignedWithoutJob(svc, now, settlements, shouldStop));
  await step(steps, 'handBacks', () => handBackSweep(svc, now, settlements, 100, shouldStop));
  await step(steps, 'send', () =>
    processWorkerChannels(svc, { now, runId, maxSends: opts.maxSends ?? MAX_SENDS_PER_RUN, budgetMs, startedAt }, settlements),
  );
  await step(steps, 'alerts', () => staffAlerts(svc, now));
  await step(steps, 'uploads', () => expirePendingUploads(svc, now));
  await step(steps, 'retention', () => retentionSweep(svc, now));
  await step(steps, 'jev_retention', () => pruneJevPartialRuns(svc, now));
  await step(steps, 'archive_retention', () => archiveRetentionSweep(svc, now));

  return { ok: Object.values(steps).every((s) => s.status === 'ran'), runId, steps };
}
