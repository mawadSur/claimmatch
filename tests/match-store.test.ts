import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const tables: Record<string, { data: unknown; error: { message: string } | null }> = {};
  function chain(table: string, startOp: string) {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const name of ['select', 'eq', 'in', 'not', 'order', 'limit']) q[name] = self;
    q.or = (filter: string) => {
      calls.push({ table, op: 'or', payload: filter });
      return q;
    };
    q.upsert = (payload: unknown) => {
      calls.push({ table, op: 'upsert', payload });
      return {
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject),
      };
    };
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve, reject);
    calls.push({ table, op: startOp });
    return q;
  }
  return { calls, tables, chain };
});

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createServiceClient: () => ({
    from: (table: string) => m.chain(table, 'from'),
  }),
}));

import { persistStoredMatches } from '@/lib/match-store';
import { catalogDeadlineFilter, getSettlementGuide } from '@/lib/settlement-guides';
import { makeLawsuit, makeProfile } from './helpers';

beforeEach(() => {
  m.calls.length = 0;
  m.tables.lawsuits = {
    data: [
      makeLawsuit(
        { requires: ['owns_vehicle'] },
        {
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'toyota-brakes',
          title: 'Toyota Brake Settlement',
          tags: { brands: ['Toyota'], class_period_start: '2019-01-01', class_period_end: '2022-12-31' },
        },
      ),
    ],
    error: null,
  };
  m.tables.profiles = {
    data: [
      makeProfile({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        onboarded: true,
        attributes: { owns_vehicle: true },
      }),
    ],
    error: null,
  };
  m.tables.profile_facts = {
    data: [
      {
        user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'purchase',
        value: 'Toyota',
        start_date: '2021-06-01',
        end_date: '2021-06-01',
        source: 'test',
      },
    ],
    error: null,
  };
  m.tables.matches = { data: [], error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('persistStoredMatches', () => {
  it('upserts score and reasons and does not send email', async () => {
    const result = await persistStoredMatches();
    expect(result.users).toBe(1);
    expect(result.persisted).toBe(1);
    const upsert = m.calls.find((c) => c.op === 'upsert');
    expect(upsert).toBeTruthy();
    const rows = upsert?.payload as Array<{ score: number; reasons: string[] }>;
    expect(rows[0].score).toBeGreaterThanOrEqual(0.5);
    expect(rows[0].reasons.some((r) => /Toyota/.test(r))).toBe(true);
    expect(m.calls.some((c) => c.table === 'notifications')).toBe(false);
  });

  it('fails loudly when the catalog cannot be read', async () => {
    m.tables.lawsuits = { data: null, error: { message: 'catalog down' } };
    await expect(persistStoredMatches()).rejects.toThrow(/catalog down/);
  });
});

describe('persistStoredMatches on a guided settlement', () => {
  const SLUG = 'hyundai-kia-vehicle-theft';
  const official = getSettlementGuide(SLUG)?.deadline as string;
  const guided = (deadline: string) => ({
    data: [
      makeLawsuit(
        { requires: ['owns_vehicle'] },
        {
          id: '22222222-2222-4222-8222-222222222222',
          slug: SLUG,
          title: 'Hyundai and Kia Vehicle Theft Settlement',
          deadline,
          tags: { brands: ['Toyota'], class_period_start: '2019-01-01', class_period_end: '2022-12-31' },
        },
      ),
    ],
    error: null,
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  it('reads the catalog’s way and matches it while the official deadline is ahead, though the feed’s has passed', async () => {
    const now = new Date('2026-11-10T17:00:00Z');
    vi.setSystemTime(now);
    expect(official > '2026-11-10').toBe(true);
    m.tables.lawsuits = guided('2026-10-01');
    expect(await persistStoredMatches()).toMatchObject({ persisted: 1 });
    expect(m.calls.find((c) => c.op === 'or')?.payload).toBe(catalogDeadlineFilter(now));
    const upsert = m.calls.find((c) => c.op === 'upsert')?.payload as Array<{ lawsuit_id: string }>;
    expect(upsert.map((row) => row.lawsuit_id)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('does not match it once the official deadline has passed, though the feed’s is ahead', async () => {
    vi.setSystemTime(new Date(`${official}T17:00:00Z`).getTime() + 24 * 3600_000);
    m.tables.lawsuits = guided('2027-12-31');
    expect(await persistStoredMatches()).toEqual({ users: 0, persisted: 0 });
    expect(m.calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});
