import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogLawsuit as lawsuit } from './helpers';

// The catalog's reads (src/lib/lawsuits.ts), against a fake Supabase client
// that records the query and returns canned rows. The pages that render them
// are in tests/catalog-pages.test.ts.
const db = vi.hoisted(() => ({
  calls: [] as [string, unknown[]][],
  list: { data: [] as unknown[] | null, error: null as { message: string } | null },
  single: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('@/lib/supabase/server', () => {
  // A query: every filter returns itself; awaiting it yields db.list.
  function query() {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'not', 'order', 'ilike', 'limit']) {
      q[m] = (...args: unknown[]) => {
        db.calls.push([m, args]);
        return q;
      };
    }
    q.maybeSingle = async () => db.single;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(db.list).then(resolve, reject);
    return q;
  }
  // The client itself must not be thenable, or `await createClient()` unwraps it.
  const client = {
    from: (table: string) => {
      db.calls.push(['from', [table]]);
      return query();
    },
  };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

import { getLawsuitBySlug, lookupLawsuitBySlug, lookupLawsuits } from '@/lib/lawsuits';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  db.calls.length = 0;
  db.list = { data: [], error: null };
  db.single = { data: null, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('catalog queries', () => {
  it('ask the database only for rows open for claims', async () => {
    db.list = { data: [lawsuit()], error: null };
    const now = new Date('2026-10-16T08:00:00Z'); // 04:00 America/New_York
    const result = await lookupLawsuits(undefined, now);
    expect(result).toEqual({ lawsuits: [lawsuit()], error: false });

    const call = (name: string) => db.calls.filter(([m]) => m === name).map(([, a]) => a);
    expect(call('eq')).toContainEqual(['review_status', 'published']);
    expect(call('in')).toContainEqual(['status', ['open', 'closing_soon']]);
    expect(call('or')).toContainEqual([expect.stringMatching(/^deadline\.is\.null,deadline\.gte\.2026-10-16,slug\.in\.\(.*six-flags/)]);
    const not = call('not')[0];
    expect(not[0]).toBe('slug');
    expect(not[1]).toBe('in');
    expect(String(not[2])).toContain('robocall-tcpa-settlement');
    expect(String(not[2])).toContain('heartburn-medication-impurity-settlement');
  });

  it('drop rows that break the rule even if the database returns them', async () => {
    db.list = {
      data: [
        lawsuit({ slug: 'ok' }),
        lawsuit({ slug: 'robocall-tcpa-settlement' }),
        lawsuit({ slug: 'closed', status: 'closed' }),
        lawsuit({ slug: 'pending', review_status: 'pending_review' }),
        lawsuit({ slug: 'past', deadline: '2020-01-01' }),
      ],
      error: null,
    };
    const { lawsuits } = await lookupLawsuits();
    expect(lawsuits.map((l) => l.slug)).toEqual(['ok']);
  });

  it('report a failed query instead of falling back to sample data', async () => {
    db.list = { data: null, error: { message: 'boom' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await lookupLawsuits()).toEqual({ lawsuits: [], error: true });
  });

  it('return nothing, and no samples, when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await lookupLawsuits()).toEqual({ lawsuits: [], error: false });
    expect(await lookupLawsuitBySlug('nationwide-data-breach-settlement')).toEqual({ status: 'missing' });
    expect(db.calls).toHaveLength(0);
  });

  it('treat fictional and unpublished settlements as missing', async () => {
    expect(await lookupLawsuitBySlug('robocall-tcpa-settlement')).toEqual({ status: 'missing' });
    expect(db.calls).toHaveLength(0);

    db.single = { data: lawsuit({ review_status: 'pending_review' }), error: null };
    expect(await lookupLawsuitBySlug('amazon-return-policy-settlement')).toEqual({ status: 'missing' });

    db.single = { data: lawsuit({ status: 'closed' }), error: null };
    expect((await lookupLawsuitBySlug('amazon-return-policy-settlement')).status).toBe('found');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.single = { data: null, error: { message: 'boom' } };
    expect(await lookupLawsuitBySlug('amazon-return-policy-settlement')).toEqual({ status: 'error' });
  });

  it('getLawsuitBySlug returns only open settlements unless asked for closed ones', async () => {
    db.single = { data: lawsuit(), error: null };
    expect((await getLawsuitBySlug('amazon-return-policy-settlement'))?.slug).toBe('amazon-return-policy-settlement');

    db.single = { data: lawsuit({ status: 'closed' }), error: null };
    expect(await getLawsuitBySlug('amazon-return-policy-settlement')).toBeNull();
    expect((await getLawsuitBySlug('amazon-return-policy-settlement', { includeClosed: true }))?.status).toBe('closed');

    db.single = { data: lawsuit({ deadline: '2020-01-01' }), error: null };
    expect(await getLawsuitBySlug('amazon-return-policy-settlement')).toBeNull();

    expect(await getLawsuitBySlug('robocall-tcpa-settlement', { includeClosed: true })).toBeNull();
  });
});
