import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => ({ insert: m.insert }) }),
}));

import { recordIngestRun } from '@/lib/jobs';
import { checkIngestStep, ingestProblems } from '@/app/api/cron/_lib/report';

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
});

describe('recordIngestRun', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    m.insert.mockReset();
    m.insert.mockResolvedValue({ error: null });
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
    m.insert.mockResolvedValue({ error: { message: 'down' } });
    await expect(recordIngestRun('cron/daily', { status: 'ran', result: CLEAN })).resolves.toBeUndefined();
    m.insert.mockRejectedValue(new Error('network'));
    await expect(recordIngestRun('cron/daily', { status: 'ran', result: CLEAN })).resolves.toBeUndefined();
  });
});
