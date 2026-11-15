import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #53: once ONE_CLICK_FILING_ENABLED is on, a tester's leftover from
// test mode (a packet made in test mode, claim_packets.is_test, 0047) is never
// queued or sent as a real filing. The repair sweep runs against a fake
// service client; job moves and the job context are faked.
const m = vi.hoisted(() => ({
  enqueueFiling: vi.fn(),
  recordFilingResult: vi.fn(),
  withdrawFiling: vi.fn(),
  loadJobContext: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin', () => ({ getAdminUser: vi.fn(), adminDeniedPath: vi.fn(() => '/login') }));
vi.mock('@/lib/filing/v2/jobs', () => ({
  enqueueFiling: m.enqueueFiling,
  recordFilingResult: m.recordFilingResult,
  withdrawFiling: m.withdrawFiling,
}));
vi.mock('@/lib/filing/channels/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/filing/channels/context')>()),
  loadJobContext: m.loadJobContext,
}));

import { repairSignedWithoutJob } from '@/lib/filing/channels/cron-sweeps';
import { sandboxFor, testItem } from '@/lib/filing/channels/test-mode';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLAIM = { id: ID(1), user_id: ID(30), lawsuit_id: ID(2) };
const SIG = { id: ID(5), packet_id: ID(7), packet_hash: 'a'.repeat(64), spec_id: ID(3), lane: 'administrator_email', signed_at: '2026-11-10T00:00:00Z' };

function setMode(mode: 'test' | 'live' | 'both') {
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', mode === 'test' ? '' : '1');
  vi.stubEnv('ONE_CLICK_FILING_TEST_MODE', mode === 'live' ? '' : '1');
}

/** One signed claim with no job; its packet is `packet` (null: unreadable). */
function fakeSvc(packet: { is_test: boolean } | null) {
  const reads: string[] = [];
  const from = (table: string) => {
    reads.push(table);
    const rows = (): unknown[] => {
      if (table === 'claims') return [CLAIM];
      if (table === 'claim_signatures') return [SIG];
      if (table === 'claim_packets') return packet ? [packet] : [];
      return [];
    };
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'in', 'order', 'limit']) chain[op] = () => chain;
    chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
    return chain;
  };
  return { svc: { from } as never, reads };
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadJobContext.mockResolvedValue({ ok: false, reason: 'record_missing' });
});
afterEach(() => vi.unstubAllEnvs());

describe('repairSignedWithoutJob after go-live', () => {
  it('never queues a leftover test signature for real once the main flag is on', async () => {
    for (const mode of ['live', 'both'] as const) {
      setMode(mode);
      const { svc, reads } = fakeSvc({ is_test: true });
      const out = await repairSignedWithoutJob(svc, new Date('2026-11-15T12:00:00Z'), new Map());
      expect(out).toEqual({ queued: 0, returned: 0, skipped: 0, test: 1 });
      expect(reads).toContain('claim_packets');
      expect(m.loadJobContext).not.toHaveBeenCalled();
      expect(m.enqueueFiling).not.toHaveBeenCalled();
      expect(m.withdrawFiling).not.toHaveBeenCalled();
    }
  });

  it('skips a signature whose packet cannot be read: doubt is never a real filing', async () => {
    setMode('live');
    const out = await repairSignedWithoutJob(fakeSvc(null).svc, new Date(), new Map());
    expect(out).toMatchObject({ queued: 0, skipped: 1, test: 0 });
    expect(m.loadJobContext).not.toHaveBeenCalled();
    expect(m.enqueueFiling).not.toHaveBeenCalled();
  });

  it('still repairs a real packet once live', async () => {
    setMode('live');
    await repairSignedWithoutJob(fakeSvc({ is_test: false }).svc, new Date(), new Map());
    expect(m.loadJobContext).toHaveBeenCalledTimes(1);
  });

  it('in test mode a test packet is repaired as before (enqueueFiling then queues a test job)', async () => {
    setMode('test');
    const { svc, reads } = fakeSvc({ is_test: true });
    await repairSignedWithoutJob(svc, new Date(), new Map());
    expect(reads).not.toContain('claim_packets');
    expect(m.loadJobContext).toHaveBeenCalledTimes(1);
  });
});

describe('the worker never sends a test item to a real administrator', () => {
  it('a real job for a test packet (or an unknown mark) is sandboxed, also once live', () => {
    setMode('live');
    vi.stubEnv('ONE_CLICK_TEST_INBOX', 'inbox@lawsuitai.example');
    expect(testItem({ is_test: false }, { is_test: true })).toEqual({ is_test: true });
    expect(testItem({ is_test: false }, { is_test: null })).toEqual({ is_test: true });
    expect(testItem({ is_test: false }, undefined)).toEqual({ is_test: true });
    expect(testItem({ is_test: false }, { is_test: false })).toEqual({ is_test: false });
    for (const channel of ['administrator_email', 'administrator_api', 'administrator_bulk', 'filing_desk'] as const) {
      expect(sandboxFor(testItem({ is_test: false }, { is_test: true }), channel, () => null).kind).not.toBe('real');
    }
    expect(sandboxFor(testItem({ is_test: false }, { is_test: false }), 'administrator_email', () => null).kind).toBe('real');
  });
});
