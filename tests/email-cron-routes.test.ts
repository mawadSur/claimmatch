import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/lib/types';

// Every side effect the cron routes can reach is mocked, so these tests show
// what each route actually calls with the D50 flags off and on.
const m = vi.hoisted(() => {
  const thenable = (result: unknown) => {
    const q: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'limit']) q[name] = () => q;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return q;
  };
  return {
    ingestAndExtract: vi.fn(),
    runAllSources: vi.fn(),
    runMatchSweep: vi.fn(),
    notifyNewMatches: vi.fn(),
    claimDue: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    recordIngestRun: vi.fn(),
    recordCronFailure: vi.fn(),
    tables: {} as Record<string, unknown>,
    createServiceClient: vi.fn(),
    thenable,
  };
});

vi.mock('@/lib/scraper/pipeline', () => ({ ingestAndExtract: m.ingestAndExtract }));
vi.mock('@/lib/scraper', () => ({ runAllSources: m.runAllSources }));
vi.mock('@/lib/match-sweep', () => ({ runMatchSweep: m.runMatchSweep }));
vi.mock('@/lib/notifications', () => ({ notifyNewMatches: m.notifyNewMatches }));
vi.mock('@/lib/jobs', () => ({
  claimDue: m.claimDue,
  completeJob: m.completeJob,
  failJob: m.failJob,
  recordIngestRun: m.recordIngestRun,
  recordCronFailure: m.recordCronFailure,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: m.createServiceClient,
  createClient: vi.fn(),
  isSupabaseConfigured: () => true,
}));

import * as daily from '@/app/api/cron/daily/route';
import * as digest from '@/app/api/cron/digest/route';
import * as match from '@/app/api/cron/match/route';
import * as jobs from '@/app/api/cron/jobs/route';
import * as pipeline from '@/app/api/cron/pipeline/route';
import * as scrape from '@/app/api/cron/scrape/route';

const SECRET = 'test-cron-secret';
const INGEST = { ingested: 2, published: 1, pending_review: 1, bySource: { settlesignal: 2 } };

function cronRequest(path: string, auth = true): Request {
  return new Request(`https://claimmatch.test${path}`, {
    headers: auth ? { authorization: `Bearer ${SECRET}` } : {},
  });
}

async function call(handler: (req: Request) => Promise<Response>, path: string, auth = true) {
  const res = await handler(cronRequest(path, auth));
  return { status: res.status, body: await res.json() };
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.ingestAndExtract.mockResolvedValue(INGEST);
  m.runAllSources.mockResolvedValue({ inserted: 1, updated: 0, bySource: {} });
  m.runMatchSweep.mockResolvedValue({ users: 1, newMatches: 1, emailed: 1 });
  m.claimDue.mockResolvedValue([]);
  m.tables = {};
  m.createServiceClient.mockImplementation(() => ({
    from: (table: string) => m.thenable(m.tables[table] ?? { data: [], error: null }),
  }));
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('MATCH_EMAILS_ENABLED', '');
  vi.stubEnv('DIGEST_ENABLED', '');
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('/api/cron/daily', () => {
  it('runs ingest and reports the match sweep as paused (D50)', async () => {
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(200);
    expect(m.ingestAndExtract).toHaveBeenCalledOnce();
    expect(m.runMatchSweep).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      job: 'daily',
      ok: true,
      ranSteps: ['ingest'],
      skippedSteps: ['matchSweep'],
      failedSteps: [],
      steps: {
        ingest: { status: 'ran', result: INGEST },
        matchSweep: { status: 'skipped', reason: 'paused (D50)' },
      },
    });
  });

  it('keeps the sweep paused for any value other than "1"', async () => {
    vi.stubEnv('MATCH_EMAILS_ENABLED', 'true');
    await call(daily.POST, '/api/cron/daily');
    expect(m.runMatchSweep).not.toHaveBeenCalled();
  });

  it('runs the sweep only when MATCH_EMAILS_ENABLED=1', async () => {
    vi.stubEnv('MATCH_EMAILS_ENABLED', '1');
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(200);
    expect(m.runMatchSweep).toHaveBeenCalledOnce();
    expect(body.ranSteps).toEqual(['ingest', 'matchSweep']);
  });

  it('answers 500 and names the step when ingest fails', async () => {
    m.ingestAndExtract.mockRejectedValue(new Error('feed timed out'));
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(500);
    expect(body.failedSteps).toEqual(['ingest']);
    expect(body.steps.ingest).toEqual({ status: 'failed', error: 'feed timed out' });
    expect(body.steps.matchSweep.reason).toBe('paused (D50)');
    expect(m.runMatchSweep).not.toHaveBeenCalled();
  });

  it('still rejects requests without the cron secret', async () => {
    const { status } = await call(daily.GET, '/api/cron/daily', false);
    expect(status).toBe(401);
    expect(m.ingestAndExtract).not.toHaveBeenCalled();
  });

  it('answers 500 when closures were held, and keeps every held row in the response and the run record', async () => {
    const heldClosures = Array.from({ length: 190 }, (_, i) => ({
      source: 'settlesignal',
      slug: `held-${i}`,
      changes: ['status open -> closed'],
    }));
    const summary = {
      ...INGEST,
      held: 190,
      heldSlugs: heldClosures.map((h) => h.slug),
      heldClosures,
      failed: 0,
      emptySources: [],
    };
    m.ingestAndExtract.mockResolvedValue(summary);
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(500);
    expect(body.failedSteps).toEqual(['ingest']);
    expect(body.steps.ingest.error).toMatch(/190 closures held for review/);
    expect(body.steps.ingest.result.heldClosures).toHaveLength(190);
    expect(m.recordIngestRun).toHaveBeenCalledWith(
      'cron/daily',
      expect.objectContaining({ status: 'failed', result: summary }),
    );
  });

  it('answers 500 when a source returned nothing or a write failed', async () => {
    m.ingestAndExtract.mockResolvedValue({ ...INGEST, held: 0, failed: 0, emptySources: ['settlesignal'] });
    let res = await call(daily.GET, '/api/cron/daily');
    expect(res.status).toBe(500);
    expect(res.body.steps.ingest.error).toBe('no records from settlesignal');
    m.ingestAndExtract.mockResolvedValue({ ...INGEST, held: 0, failed: 2, emptySources: [] });
    res = await call(daily.GET, '/api/cron/daily');
    expect(res.status).toBe(500);
    expect(res.body.steps.ingest.error).toBe('2 catalog reads or writes failed');
  });

  it('records a clean run as done', async () => {
    m.ingestAndExtract.mockResolvedValue({ ...INGEST, held: 0, failed: 0, emptySources: [] });
    const { status } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(200);
    expect(m.recordIngestRun).toHaveBeenCalledWith('cron/daily', expect.objectContaining({ status: 'ran' }));
  });

  it('fails loudly in production when the service role key is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(500);
    expect(body.steps.ingest).toEqual({
      status: 'failed',
      error: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    });
    expect(m.ingestAndExtract).not.toHaveBeenCalled();
  });

  it('reports missing config as skipped outside production', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { status, body } = await call(daily.GET, '/api/cron/daily');
    expect(status).toBe(200);
    expect(body.steps.ingest).toEqual({
      status: 'skipped',
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set',
    });
  });
});

describe('/api/cron/digest', () => {
  it('is paused (D50): 200, says so, touches nothing', async () => {
    const { status, body } = await call(digest.GET, '/api/cron/digest');
    expect(status).toBe(200);
    expect(body.skipped).toBe('paused (D50)');
    expect(body.skippedSteps).toEqual(['digest']);
    expect(body.steps.digest).toMatchObject({ status: 'skipped', reason: 'paused (D50)' });
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.notifyNewMatches).not.toHaveBeenCalled();
  });

  it('runs only when DIGEST_ENABLED=1', async () => {
    vi.stubEnv('DIGEST_ENABLED', '1');
    m.tables.profiles = {
      data: [{ id: 'u1', email: 'jane@example.com', full_name: 'Jane' }],
      error: null,
    };
    m.tables.matches = {
      data: [
        { lawsuit: { title: 'Real', slug: 'real', review_status: 'published', typical_payout: null, deadline: null } },
        { lawsuit: { title: 'Hidden', slug: 'hidden', review_status: 'pending_review' } },
      ],
      error: null,
    };
    const { status, body } = await call(digest.GET, '/api/cron/digest');
    expect(status).toBe(200);
    expect(body.steps.digest).toEqual({ status: 'ran', result: { users: 1, emailed: 1 } });
    expect(m.notifyNewMatches).toHaveBeenCalledOnce();
    expect(m.notifyNewMatches.mock.calls[0][1]).toEqual([
      { title: 'Real', slug: 'real', typical_payout: null, deadline: null },
    ]);
  });

  it('answers 500 when enabled and a query fails', async () => {
    vi.stubEnv('DIGEST_ENABLED', '1');
    m.tables.profiles = { data: null, error: { code: '57014', message: 'timeout' } };
    const { status, body } = await call(digest.GET, '/api/cron/digest');
    expect(status).toBe(500);
    expect(body.failedSteps).toEqual(['digest']);
    expect(m.notifyNewMatches).not.toHaveBeenCalled();
  });

  it('still rejects requests without the cron secret', async () => {
    expect((await call(digest.GET, '/api/cron/digest', false)).status).toBe(401);
  });
});

describe('/api/cron/match', () => {
  it('is paused (D50) like the daily step', async () => {
    const { status, body } = await call(match.GET, '/api/cron/match');
    expect(status).toBe(200);
    expect(body.skipped).toBe('paused (D50)');
    expect(body.skippedSteps).toEqual(['matchSweep']);
    expect(m.runMatchSweep).not.toHaveBeenCalled();
  });

  it('runs only when MATCH_EMAILS_ENABLED=1, and reports a failure', async () => {
    vi.stubEnv('MATCH_EMAILS_ENABLED', '1');
    m.runMatchSweep.mockRejectedValue(new Error('sweep broke'));
    const { status, body } = await call(match.POST, '/api/cron/match');
    expect(m.runMatchSweep).toHaveBeenCalledOnce();
    expect(status).toBe(500);
    expect(body.steps.matchSweep).toEqual({ status: 'failed', error: 'sweep broke' });
  });
});

describe('/api/cron/jobs', () => {
  const job = (id: string, type: string): Job => ({
    id,
    type,
    payload: {},
    status: 'running',
    attempts: 1,
    max_attempts: 3,
    run_after: '2026-10-16T00:00:00Z',
    locked_at: null,
    result: null,
    error: null,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  });

  it('never runs the sweep for a match job, and reports every job', async () => {
    m.claimDue.mockResolvedValue([job('a', 'match'), job('b', 'pipeline'), job('c', 'notify')]);
    const { status, body } = await call(jobs.GET, '/api/cron/jobs');
    expect(m.runMatchSweep).not.toHaveBeenCalled();
    expect(m.notifyNewMatches).not.toHaveBeenCalled();
    expect(m.ingestAndExtract).toHaveBeenCalledOnce();
    expect(m.completeJob).toHaveBeenCalledWith('a', { noop: true });
    expect(m.completeJob).toHaveBeenCalledWith('b', INGEST);
    expect(m.failJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), 'unknown job type: notify');
    expect(status).toBe(500);
    expect(body).toMatchObject({
      job: 'jobs',
      claimed: 3,
      ranSteps: ['pipeline:b'],
      skippedSteps: ['match:a'],
      failedSteps: ['notify:c'],
    });
  });

  it('marks a job failed when it throws and keeps going', async () => {
    m.claimDue.mockResolvedValue([job('a', 'scrape'), job('b', 'match')]);
    m.ingestAndExtract.mockRejectedValue(new Error('adapter down'));
    const { status, body } = await call(jobs.GET, '/api/cron/jobs');
    expect(status).toBe(500);
    expect(m.failJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'adapter down');
    expect(body.skippedSteps).toEqual(['match:b']);
  });

  it('answers 200 with nothing to do', async () => {
    const { status, body } = await call(jobs.GET, '/api/cron/jobs');
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, claimed: 0, ranSteps: [], failedSteps: [] });
  });

  it('records every ingest job as a run, and fails the step when closures were held', async () => {
    const held = { ...INGEST, held: 2, heldSlugs: ['a', 'b'], failed: 0, emptySources: [] };
    m.ingestAndExtract.mockResolvedValue(held);
    m.claimDue.mockResolvedValue([job('p', 'pipeline')]);
    const { status, body } = await call(jobs.GET, '/api/cron/jobs');
    expect(status).toBe(500);
    expect(body.failedSteps).toEqual(['pipeline:p']);
    expect(body.steps['pipeline:p']).toMatchObject({ status: 'failed', result: { heldSlugs: ['a', 'b'] } });
    expect(body.steps['pipeline:p'].error).toMatch(/2 closures held for review/);
    expect(m.recordIngestRun).toHaveBeenCalledWith(
      'cron/jobs:pipeline',
      expect.objectContaining({ status: 'failed', result: held }),
    );
    // The queue job ran, so it is not retried; the run record carries the problem.
    expect(m.completeJob).toHaveBeenCalledWith('p', held);
    expect(m.failJob).not.toHaveBeenCalled();

    m.ingestAndExtract.mockResolvedValue({ ...INGEST, held: 0, failed: 0, emptySources: [] });
    m.claimDue.mockResolvedValue([job('s', 'scrape')]);
    const clean = await call(jobs.GET, '/api/cron/jobs');
    expect(clean.status).toBe(200);
    expect(m.recordIngestRun).toHaveBeenLastCalledWith('cron/jobs:scrape', expect.objectContaining({ status: 'ran' }));
  });
});

describe('/api/cron/pipeline and /api/cron/scrape', () => {
  it('ingest without matching or emailing', async () => {
    const p = await call(pipeline.GET, '/api/cron/pipeline');
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ job: 'pipeline', ranSteps: ['ingest'] });
    const s = await call(scrape.GET, '/api/cron/scrape');
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ job: 'scrape', ranSteps: ['scrape'] });
    expect(m.runMatchSweep).not.toHaveBeenCalled();
    expect(m.notifyNewMatches).not.toHaveBeenCalled();
  });

  it('answer 500 when their step fails', async () => {
    m.ingestAndExtract.mockRejectedValue(new Error('x'));
    m.runAllSources.mockRejectedValue(new Error('y'));
    expect((await call(pipeline.POST, '/api/cron/pipeline')).status).toBe(500);
    expect((await call(scrape.POST, '/api/cron/scrape')).status).toBe(500);
  });

  it('pipeline answers 500 and records the run when closures were held', async () => {
    m.ingestAndExtract.mockResolvedValue({ ...INGEST, held: 3, heldSlugs: ['a', 'b', 'c'], failed: 0, emptySources: [] });
    const { status, body } = await call(pipeline.GET, '/api/cron/pipeline');
    expect(status).toBe(500);
    expect(body.steps.ingest).toMatchObject({ status: 'failed', result: { heldSlugs: ['a', 'b', 'c'] } });
    expect(m.recordIngestRun).toHaveBeenCalledWith('cron/pipeline', expect.objectContaining({ status: 'failed' }));
  });

  it('scrape answers 500 and records the run when closures were held, like the other ingest routes', async () => {
    const held = { ...INGEST, held: 190, heldSlugs: ['a'], failed: 0, emptySources: [] };
    m.runAllSources.mockResolvedValue(held);
    const { status, body } = await call(scrape.GET, '/api/cron/scrape');
    expect(status).toBe(500);
    expect(body.failedSteps).toEqual(['scrape']);
    expect(body.steps.scrape.error).toMatch(/190 closures held for review/);
    expect(m.recordIngestRun).toHaveBeenCalledWith(
      'cron/scrape',
      expect.objectContaining({ status: 'failed', result: held }),
    );
  });

  it('scrape records a clean run, and a thrown one, as runs', async () => {
    m.runAllSources.mockResolvedValue({ ...INGEST, held: 0, failed: 0, emptySources: [] });
    expect((await call(scrape.POST, '/api/cron/scrape')).status).toBe(200);
    expect(m.recordIngestRun).toHaveBeenLastCalledWith('cron/scrape', expect.objectContaining({ status: 'ran' }));
    m.runAllSources.mockRejectedValue(new Error('feed timed out'));
    expect((await call(scrape.POST, '/api/cron/scrape')).status).toBe(500);
    expect(m.recordIngestRun).toHaveBeenLastCalledWith('cron/scrape', {
      status: 'failed',
      error: 'feed timed out',
    });
  });

  it('scrape skips (and records nothing) without the service config outside production', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { status, body } = await call(scrape.GET, '/api/cron/scrape');
    expect(status).toBe(200);
    expect(body.skippedSteps).toEqual(['scrape']);
    expect(m.runAllSources).not.toHaveBeenCalled();
    expect(m.recordIngestRun).not.toHaveBeenCalled();
  });
});
