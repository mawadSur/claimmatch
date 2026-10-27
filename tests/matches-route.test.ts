import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/lib/types';
import { makeLawsuit, makeProfile } from './helpers';

const h = vi.hoisted(() => ({
  user: { id: 'user-a', email: 'a@example.com' } as { id: string; email: string } | null,
  profile: null as Profile | null,
  upserts: [] as Record<string, unknown>[],
  catalog: { lawsuits: [] as ReturnType<typeof makeLawsuit>[], error: false },
  stored: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupLawsuits: async () => h.catalog,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: h.profile }),
            }),
          }),
        };
      }
      if (table === 'matches') {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            h.upserts.push(...rows);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: h.stored, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { GET, POST } from '@/app/api/matches/route';

const now = new Date('2026-10-27T12:00:00Z');

function openBreach() {
  return makeLawsuit(
    { requires: ['had_data_breach'] },
    { id: 'open-breach', deadline: '2026-12-01', status: 'open', review_status: 'published' },
  );
}

function expiredBreach() {
  return makeLawsuit(
    { requires: ['had_data_breach'] },
    { id: 'expired-breach', deadline: '2026-10-15', status: 'open', review_status: 'published' },
  );
}

describe('/api/matches', () => {
  beforeEach(() => {
    h.user = { id: 'user-a', email: 'a@example.com' };
    h.profile = makeProfile({
      id: 'user-a',
      attributes: { had_data_breach: true },
    });
    h.upserts = [];
    h.catalog = { lawsuits: [openBreach(), expiredBreach()], error: false };
    h.stored = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POST skips past-deadline settlements even if the catalog still lists them', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ user_id: 'user-a', lawsuit_id: 'open-breach' });
  });

  it('GET hides matches whose settlement deadline has passed', async () => {
    h.stored = [
      { id: 'm1', lawsuit_id: 'open-breach', score: 1, dismissed: false, lawsuit: openBreach() },
      {
        id: 'm2',
        lawsuit_id: 'expired-breach',
        score: 1,
        dismissed: false,
        lawsuit: expiredBreach(),
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches.map((m: { lawsuit_id: string }) => m.lawsuit_id)).toEqual(['open-breach']);
  });

  it('401s when no one is signed in', async () => {
    h.user = null;
    expect((await POST()).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });
});
