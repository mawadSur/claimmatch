import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  runningRows: [] as Array<{ id: string; payload: unknown; created_at: string }>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        m.insert(row);
        const result = { error: null, data: { id: 'job-1' } };
        return {
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject),
          select: () => ({
            single: async () => result,
          }),
        };
      },
      update: (row: unknown) => {
        m.update(row);
        const eq = () => ({
          eq: () => Promise.resolve({ error: null }),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        });
        return { eq };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            lte: () => ({
              limit: async () => ({ data: m.runningRows, error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import {
  failStaleIngestRuns,
  finishIngestRun,
  INGEST_STARTED_PHASE,
  recordIngestRun,
  startIngestRun,
} from '@/lib/jobs';
import { checkIngestStep, ingestProblems, ingestRunNeedsAttention } from '@/app/api/cron/_lib/report';

const CLEAN = { ingested: 300, held: 0, failed: 0, emptySources: [], heldSlugs: [], heldClosures: [] };

describe('ingest problems (until D40 alerting)', () => {
  it('treats held closures, failed writes and empty sources as needing a person', () => {
    expect(ingestProblems(CLEAN)).toEqual([]);
    expect(ingestProblems({ ...CLEAN, held: 4 })[0]).toMatch(/^4 closures held for review/);
    expect(ingestProblems({ ...CLEAN, failed: 1 })).toEqual(['1 catalog reads or writes failed']);
    expect(ingestProblems({ ...CLEAN, emptySources: ['settlesignal'] })).toEqual(['no records from settlesignal']);
    expect(ingestProblems(null)).toEqual([]);
  });

  it('fails the step but keeps its summary', () => {
    expect(checkIngestStep({ status: 'ran', result: CLEAN })).toEqual({ status: 'ran', result: CLEAN });
    const held = { ...CLEAN, held: 2, heldSlugs: ['a', 'b'] };
    expect(checkIngestStep({ status: 'ran', result: held })).toMatchObject({ status: 'failed', result: held });
    const thrown = { status: 'failed' as const, error: 'feed timed out' };
    expect(checkIngestStep(thrown)).toBe(thrown);
    const skipped = { status: 'skipped' as const, reason: 'x' };
    expect(checkIngestStep(skipped)).toBe(skipped);
  });

  it('treats held-only runs as a warning when that flag is on', () => {
    const held = { ...CLEAN, held: 187, heldSlugs: ['a'], failed: 0, emptySources: [] };
    expect(checkIngestStep({ status: 'ran', result: held }, { heldIsWarning: true })).toMatchObject({
      status: 'warning',
      result: held,
    });
    expect(
      checkIngestStep(
        { status: 'ran', result: { ...held, failed: 1 } },
        { heldIsWarning: true },
      ),
    ).toMatchObject({ status: 'failed' });
    expect(checkIngestStep({ status: 'ran', result: held }, { heldIsWarning: false })).toMatchObject({
      status: 'failed',
    });
  });

  it('flags a stored run as needing attention by its summary, whatever its stored status', () => {
    expect(ingestRunNeedsAttention({ status: 'done', summary: CLEAN })).toBe(false);
    expect(ingestRunNeedsAttention({ status: 'failed', summary: {} })).toBe(true);
    // A queued pipeline job is stored as done even when it held closures.
    expect(ingestRunNeedsAttention({ status: 'done', summary: { ...CLEAN, held: 190 } })).toBe(true);
    expect(ingestRunNeedsAttention({ status: 'done', summary: { ...CLEAN, failed: 1 } })).toBe(true);
    expect(ingestRunNeedsAttention({ status: 'done', summary: { ...CLEAN, emptySources: ['settlesignal'] } })).toBe(true);
    expect(ingestRunNeedsAttention({ status: 'done', summary: null })).toBe(false);
  });
});

describe('recordIngestRun', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    m.insert.mockReset();
    m.update.mockReset();
    m.runningRows = [];
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    errorLog.mockRestore();
  });

  it('stores a finished run (never queued, so the worker never re-runs it) with the full summary', async () => {
    const held = { ...CLEAN, held: 2, heldSlugs: ['a', 'b'] };
    await recordIngestRun('cron/daily', { status: 'failed', error: '2 closures held for review', result: held });
    expect(m.insert).toHaveBeenCalledWith({
      type: 'pipeline',
      status: 'failed',
      payload: { trigger: 'cron/daily' },
      attempts: 1,
      result: held,
      error: '2 closures held for review',
    });
    await recordIngestRun('cron/daily', { status: 'ran', result: CLEAN });
    expect(m.insert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'done', result: CLEAN, error: null }));
  });

  it('records nothing for a skipped run and never throws', async () => {
    await recordIngestRun('cron/daily', { status: 'skipped' });
    expect(m.insert).not.toHaveBeenCalled();
    m.insert.mockImplementationOnce(() => {
      throw new Error('network');
    });
    await expect(recordIngestRun('cron/daily', { status: 'ran', result: CLEAN })).resolves.toBeUndefined();
  });
});

describe('startIngestRun / finishIngestRun', () => {
  beforeEach(() => {
    m.insert.mockReset();
    m.update.mockReset();
    m.runningRows = [];
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('inserts a running row with phase started', async () => {
    const id = await startIngestRun('cron/daily', { dryRun: true });
    expect(id).toBe('job-1');
    expect(m.insert).toHaveBeenCalledWith({
      type: 'pipeline',
      status: 'running',
      payload: { trigger: 'cron/daily', phase: INGEST_STARTED_PHASE, dryRun: true },
      attempts: 1,
      result: null,
      error: null,
    });
  });

  it('stores a held-only warning as done with phase held_warning', async () => {
    await finishIngestRun('job-1', 'cron/daily', {
      status: 'warning',
      error: '187 closures held for review',
      result: { ...CLEAN, held: 187 },
    });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'done',
        error: '187 closures held for review',
        payload: { trigger: 'cron/daily', phase: 'held_warning' },
      }),
    );
  });

  it('updates the started row to failed with the error text', async () => {
    await finishIngestRun('job-1', 'cron/daily', { status: 'failed', error: 'feed timed out' });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'feed timed out',
        payload: { trigger: 'cron/daily', phase: 'failed' },
      }),
    );
  });

  it('marks leftover running ingest rows failed', async () => {
    m.runningRows = [
      {
        id: 'old',
        payload: { trigger: 'cron/daily', phase: INGEST_STARTED_PHASE },
        created_at: '2026-10-26T06:00:00Z',
      },
    ];
    const flipped = await failStaleIngestRuns({
      now: new Date('2026-10-26T06:20:00Z'),
      olderThanMs: 15 * 60 * 1000,
    });
    expect(flipped).toEqual([{ id: 'old', trigger: 'cron/daily' }]);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: expect.stringMatching(/Timed out or killed/),
      }),
    );
  });
});
