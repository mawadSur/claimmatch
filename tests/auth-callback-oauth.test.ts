import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  profile: { data: null as unknown, error: null as unknown },
  updates: [] as Array<{ patch: unknown; id: unknown }>,
}));

vi.mock('@/lib/session-flags', () => ({
  applySessionFlags: vi.fn().mockResolvedValue({ internal: false, cohort: null }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: m.exchangeCodeForSession },
    from: (table: string) => {
      expect(table).toBe('profiles');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => m.profile }) }),
        update: (patch: unknown) => ({
          eq: async (_col: string, id: unknown) => {
            m.updates.push({ patch, id });
            return { error: null };
          },
        }),
      };
    },
  }),
}));

import { GET } from '@/app/auth/callback/route';

const ORIGIN = 'https://claimmatch.test';
const NOW = Date.now();

function callback(query: string, cookie?: string) {
  return GET(new NextRequest(`${ORIGIN}/auth/callback${query}`, cookie ? { headers: { cookie } } : undefined));
}

function googleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-g',
    email: 'ada@example.com',
    created_at: new Date(NOW - 30_000).toISOString(),
    user_metadata: { full_name: 'Ada Lovelace', name: 'Ada Lovelace', email: 'ada@example.com' },
    identities: [{ provider: 'google' }],
    ...overrides,
  };
}

const location = (res: Response) => new URL(res.headers.get('location') ?? '');

beforeEach(() => {
  m.exchangeCodeForSession.mockReset();
  m.exchangeCodeForSession.mockResolvedValue({ error: null, data: { user: googleUser() } });
  m.profile = { data: { full_name: '', onboarded: false }, error: null };
  m.updates = [];
});

describe('/auth/callback after Continue with Google', () => {
  it('sends a new Google member to onboarding, then to the claim they picked', async () => {
    const res = await callback('?code=abc&oauth=google&next=%2Fclaim%2Freal-settlement');
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    const to = location(res);
    expect(to.pathname).toBe('/onboarding');
    expect(to.searchParams.get('next')).toBe('/claim/real-settlement');
    // Not an email confirmation: no "Email confirmed" banner or second signup_completed.
    expect(to.searchParams.has('confirmed')).toBe(false);
    expect(res.headers.get('set-cookie')).toMatch(/cm_next=;/);
  });

  it('uses the pending-next cookie from /signup when there is no ?next', async () => {
    const res = await callback('?code=abc&oauth=google', 'cm_next=%2Fclaim%2Fx');
    expect(`${location(res).pathname}${location(res).search}`).toBe('/onboarding?next=%2Fclaim%2Fx');
  });

  it('fills an empty profiles.full_name from Google’s name', async () => {
    await callback('?code=abc&oauth=google');
    expect(m.updates).toEqual([{ patch: { full_name: 'Ada Lovelace' }, id: 'user-g' }]);
  });

  it('falls back to Google’s name field, and never overwrites a name already saved', async () => {
    m.exchangeCodeForSession.mockResolvedValue({ error: null, data: { user: googleUser({ user_metadata: { name: 'Grace Hopper' } }) } });
    await callback('?code=abc&oauth=google');
    expect(m.updates).toEqual([{ patch: { full_name: 'Grace Hopper' }, id: 'user-g' }]);

    m.updates = [];
    m.profile = { data: { full_name: 'Ada K. Lovelace', onboarded: true }, error: null };
    await callback('?code=abc&oauth=google');
    expect(m.updates).toEqual([]);
  });

  it('sends an onboarded member straight back (the sign-in-again path to the claim page)', async () => {
    m.profile = { data: { full_name: 'Ada', onboarded: true }, error: null };
    const res = await callback('?code=abc&oauth=google&next=%2Fclaim%2Freal-settlement');
    expect(res.headers.get('location')).toBe(`${ORIGIN}/claim/real-settlement`);
    expect((await callback('?code=abc&oauth=google')).headers.get('location')).toBe(`${ORIGIN}/dashboard`);
  });

  it('never leaves the site, whatever ?next says', async () => {
    m.profile = { data: { full_name: 'Ada', onboarded: true }, error: null };
    const res = await callback('?code=abc&oauth=google&next=%2F%5Cevil.example');
    expect(res.headers.get('location')).toBe(`${ORIGIN}/dashboard`);
  });

  it('treats a profile it cannot read as not onboarded', async () => {
    m.profile = { data: null, error: { message: 'down' } };
    const res = await callback('?code=abc&oauth=google&next=%2Fclaim%2Fx');
    expect(location(res).pathname).toBe('/onboarding');
    expect(m.updates).toEqual([]);
  });

  it('a canceled or failed Google sign-in goes back to log in with oauth=failed, not "link expired"', async () => {
    const canceled = location(await callback('?oauth=google&next=%2Fclaim%2Fx&error=access_denied&error_description=denied'));
    expect(canceled.pathname).toBe('/login');
    expect(canceled.searchParams.get('oauth')).toBe('failed');
    expect(canceled.searchParams.get('next')).toBe('/claim/x');
    expect(canceled.searchParams.has('link')).toBe(false);
    expect(m.exchangeCodeForSession).not.toHaveBeenCalled();

    m.exchangeCodeForSession.mockResolvedValue({ error: { message: 'code verifier missing' }, data: null });
    const failed = location(await callback('?code=abc&oauth=google'));
    expect(failed.pathname).toBe('/login');
    expect(failed.searchParams.get('oauth')).toBe('failed');
    expect(failed.searchParams.has('next')).toBe(false);
    expect(failed.searchParams.has('confirmed')).toBe(false);
  });

  it('leaves email-confirmation links as they were', async () => {
    m.exchangeCodeForSession.mockResolvedValue({ error: null, data: { user: { id: 'u', email: 'e@example.com' } } });
    const res = await callback('?code=abc', 'cm_next=%2Fclaim%2Freal-settlement');
    expect(res.headers.get('location')).toBe(`${ORIGIN}/onboarding?next=%2Fclaim%2Freal-settlement&confirmed=1`);
    expect(m.updates).toEqual([]);
  });
});
