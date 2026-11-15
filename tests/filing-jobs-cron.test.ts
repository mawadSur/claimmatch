import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The cron route and the worker-channel loop. Jobs, the job context and the
// adapters are faked: nothing reaches Supabase, Resend or any official site.
const m = vi.hoisted(() => ({
  runFilingCron: vi.fn(),
  claimNextJob: vi.fn(),
  recordFilingResult: vi.fn(),
  loadJobContext: vi.fn(),
  preSendCheck: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: () => ({}) }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/v2/jobs', () => ({
  claimNextJob: m.claimNextJob,
  recordFilingResult: m.recordFilingResult,
  enqueueFiling: vi.fn(),
  withdrawFiling: vi.fn(),
  WORKER_LOCK_MINUTES: 15,
}));
vi.mock('@/lib/filing/channels/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/channels/context')>()),
  loadJobContext: m.loadJobContext,
  preSendCheck: m.preSendCheck,
}));
vi.mock('@/lib/filing/channels/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/filing/channels/index')>();
  return {
    ...actual,
    getChannelAdapter: (channel: string) => ({ channel, mode: 'worker', supports: () => ({ ok: true }), submit: m.submit }),
  };
});

import { GET } from '@/app/api/cron/filing/route';
import { processWorkerChannels } from '@/lib/filing/channels/cron';

const SECRET = 'cron-secret';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-11-12T15:00:00Z');

function cronRequest(auth: string | null = `Bearer ${SECRET}`) {
  return new Request('https://lawsuitai.org/api/cron/filing', { headers: auth ? { authorization: auth } : {} });
}

describe('GET /api/cron/filing', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    m.runFilingCron.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is 404 with the flag off, before checking the secret or reading anything', async () => {
    vi.doMock('@/lib/filing/channels/cron', () => ({ runFilingCron: m.runFilingCron }));
    const res = await GET(cronRequest(null));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'not_found' });
    expect(m.runFilingCron).not.toHaveBeenCalled();
  });

  it('needs the cron secret', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    expect((await GET(cronRequest(null))).status).toBe(401);
    expect((await GET(cronRequest('Bearer wrong'))).status).toBe(401);
  });

  it('runs one pass and answers 500 when any step failed', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    vi.doMock('@/lib/filing/channels/cron', () => ({ runFilingCron: m.runFilingCron }));
    m.runFilingCron.mockResolvedValueOnce({ ok: true, runId: 'r1', steps: { locks: { status: 'ran', result: { expired: 0 } } } });
    const ok = await GET(cronRequest());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ job: 'filing', ok: true, runId: 'r1' });
    m.runFilingCron.mockResolvedValueOnce({ ok: false, runId: 'r2', steps: { send: { status: 'failed', error: 'x' } } });
    expect((await GET(cronRequest())).status).toBe(500);
    vi.doUnmock('@/lib/filing/channels/cron');
  });
});

describe('processWorkerChannels: one send per job, never twice', () => {
  const job = (n: number, channel = 'administrator_email') => ({ id: ID(n), claim_id: ID(n + 100), channel, attempt: 1, idempotency_key: `sig:${ID(n)}` });
  const ctx = {
    job: job(1),
    claim: { id: ID(101), user_id: ID(30), lawsuit_id: ID(2), status: 'filing' },
    signature: { signature_id: ID(5) },
    packet: { documents: [] },
    packetRow: { id: ID(4) },
    spec: { id: ID(3), version: 1, content: { deadline: null } },
    settlement: {
      lawsuit: { id: ID(2), title: 'Acme', deadline: '2026-12-31' },
      policy: { channels: [{ type: 'administrator_email', enabled: true }] },
    },
    documents: [],
  };
  const pass = { result: { outcome: 'pass', issues: [] }, runId: ID(90) };
  const run = (maxSends = 20) =>
    processWorkerChannels({} as never, { now: NOW, runId: 'run-1', maxSends, budgetMs: 60_000, startedAt: Date.now() }, new Map());

  beforeEach(() => {
    for (const fn of Object.values(m)) fn.mockReset();
    m.recordFilingResult.mockResolvedValue({ ok: true, job: {}, claimStatus: 'x' });
    m.loadJobContext.mockResolvedValue({ ok: true, ctx });
    m.preSendCheck.mockResolvedValue(pass);
  });

  it('takes due jobs with a worker lock, re-checks each with Jev, submits and records filed', async () => {
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: job(1) }).mockResolvedValue({ ok: true, job: null });
    m.submit.mockResolvedValue({ status: 'filed', confirmation_number: null, evidence: [{ kind: 'email' }], result: { channel: 'administrator_email' } });
    const counts = await run();
    expect(counts).toMatchObject({ taken: 1, filed: 1 });
    expect(m.claimNextJob).toHaveBeenCalledWith(expect.objectContaining({ channel: 'administrator_email', lockOwner: 'worker:run-1', actor: 'system', lockMinutes: 15 }));
    expect(m.claimNextJob).toHaveBeenCalledWith(expect.objectContaining({ channel: 'administrator_api' }));
    expect(m.preSendCheck).toHaveBeenCalledWith(expect.anything(), ctx, NOW, 'worker', expect.any(Map));
    expect(m.recordFilingResult).toHaveBeenCalledWith(expect.objectContaining({ jobId: ID(1), lockOwner: 'worker:run-1', outcome: 'filed', evidence: [{ kind: 'email' }] }));
  });

  it('a Jev block right before sending is needs_attention, and nothing is sent', async () => {
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: job(1) }).mockResolvedValue({ ok: true, job: null });
    m.preSendCheck.mockResolvedValue({ result: { outcome: 'block', issues: [{ severity: 'block', rule_id: 'global.lane_allowed' }] }, runId: ID(91) });
    await run();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.recordFilingResult).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'needs_attention', reasonCode: 'jev_blocked', result: { jev_run_id: ID(91), blocked_rules: ['global.lane_allowed'] } }),
    );
  });

  it('an unreadable job (hash mismatch) is needs_attention without a send', async () => {
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: job(1) }).mockResolvedValue({ ok: true, job: null });
    m.loadJobContext.mockResolvedValue({ ok: false, reason: 'packet_hash_mismatch' });
    await run();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.recordFilingResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'needs_attention', reasonCode: 'packet_hash_mismatch' }));
  });

  it('a settlement whose kill switch or policy cannot be read waits for the next run, and nothing is sent', async () => {
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: job(1) }).mockResolvedValue({ ok: true, job: null });
    m.loadJobContext.mockResolvedValue({ ok: false, reason: 'settlement_unreadable' });
    const counts = await run();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.preSendCheck).not.toHaveBeenCalled();
    expect(counts).toMatchObject({ taken: 1, requeued: 1, filed: 0 });
    expect(m.recordFilingResult).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: ID(1), lockOwner: 'worker:run-1', outcome: 'not_submitted', result: { not_sent: 'settlement_unreadable' } }),
    );
  });

  it('a throw or an unsure answer after the request may have left is needs_attention, never a retry', async () => {
    m.claimNextJob
      .mockResolvedValueOnce({ ok: true, job: job(1) })
      .mockResolvedValueOnce({ ok: true, job: job(2) })
      .mockResolvedValue({ ok: true, job: null });
    m.submit.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce({ status: 'not_sent', reason_code: 'x', retry_safe: false });
    const counts = await run();
    expect(counts).toMatchObject({ taken: 2, needs_attention: 2, requeued: 0 });
    const outcomes = m.recordFilingResult.mock.calls.map(([input]) => input.outcome);
    expect(outcomes).toEqual(['needs_attention', 'needs_attention']);
    expect(outcomes).not.toContain('not_submitted');
  });

  it('requeues only when nothing could be sent, and stops that channel for this run', async () => {
    m.claimNextJob.mockResolvedValueOnce({ ok: true, job: job(1) }).mockResolvedValueOnce({ ok: true, job: job(2, 'administrator_api') }).mockResolvedValue({ ok: true, job: null });
    m.submit.mockResolvedValueOnce({ status: 'not_sent', reason_code: 'email_not_configured', retry_safe: true }).mockResolvedValue({ status: 'needs_attention', reason_code: 'adapter_unsupported', detail: null });
    const counts = await run();
    expect(counts).toMatchObject({ taken: 2, requeued: 1, needs_attention: 1 });
    expect(m.recordFilingResult.mock.calls[0][0]).toMatchObject({ jobId: ID(1), outcome: 'not_submitted' });
    expect(m.claimNextJob.mock.calls.map(([a]) => a.channel)).toEqual(['administrator_email', 'administrator_api', 'administrator_api']);
  });

  it('stops at the send limit', async () => {
    m.claimNextJob.mockImplementation(async () => ({ ok: true, job: job(1) }));
    m.submit.mockResolvedValue({ status: 'filed', confirmation_number: null, evidence: [], result: {} });
    expect((await run(3)).taken).toBe(3);
  });
});
