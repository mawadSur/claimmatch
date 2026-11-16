import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  profile: { data: null as unknown, error: null as unknown },
  updates: [] as Array<{ patch: unknown; id: unknown }>,
  flags: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/session-flags', () => ({ applySessionFlags: m.flags }));
vi.mock('@/lib/analytics/server', () => ({ captureServerEvent: m.capture }));

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

const ORIGIN = 'https://lawsuitai.test';
const RELAY = 'x7k2m9q4ab@privaterelay.appleid.com';

function callback(query: string, cookie?: string) {
  return GET(new NextRequest(`${ORIGIN}/auth/callback${query}`, cookie ? { headers: { cookie } } : undefined));
}

/** What Supabase gives for an Apple web sign-in that shared no name, with Hide My Email on. */
function appleUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-apple',
    email: RELAY,
    created_at: new Date(Date.now() - 30_000).toISOString(),
    user_metadata: { email: RELAY, email_verified: true, iss: 'https://appleid.apple.com', sub: '001234.abcd', provider_id: '001234.abcd' },
    app_metadata: { provider: 'apple', providers: ['apple'] },
    identities: [{ provider: 'apple' }],
    ...overrides,
  };
}

const location = (res: Response) => new URL(res.headers.get('location') ?? '');

beforeEach(() => {
  m.exchangeCodeForSession.mockReset();
  m.exchangeCodeForSession.mockResolvedValue({ error: null, data: { user: appleUser() } });
  m.profile = { data: { full_name: '', onboarded: false }, error: null };
  m.updates = [];
  m.flags.mockReset();
  m.flags.mockResolvedValue({ internal: false, cohort: null });
  m.capture.mockReset();
  m.capture.mockResolvedValue(false);
});

describe('/auth/callback after Continue with Apple', () => {
  it('sends a new Apple member without a name to onboarding (which asks for it), then to their claim', async () => {
    const res = await callback('?code=abc&oauth=apple&next=%2Fclaim%2Freal-settlement');
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    const to = location(res);
    expect(to.pathname).toBe('/onboarding');
    expect(to.searchParams.get('next')).toBe('/claim/real-settlement');
    expect(to.searchParams.has('confirmed')).toBe(false);
    // No name from Apple: nothing written, the onboarding name field starts empty.
    expect(m.updates).toEqual([]);
  });

  it('works with a private relay address like any other email', async () => {
    await callback('?code=abc&oauth=apple');
    expect(m.flags).toHaveBeenCalledWith({ userId: 'user-apple', email: RELAY });
  });

  it('fills an empty name when Apple did share one', async () => {
    m.exchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: appleUser({ user_metadata: { email: RELAY, full_name: 'Ada Lovelace' } }) },
    });
    await callback('?code=abc&oauth=apple');
    expect(m.updates).toEqual([{ patch: { full_name: 'Ada Lovelace' }, id: 'user-apple' }]);
  });

  it('records the provider as apple, with the account id only', async () => {
    await callback('?code=abc&oauth=apple');
    expect(m.capture).toHaveBeenCalledWith({
      event: 'signup_completed',
      distinctId: 'user-apple',
      properties: { evidence: 'oauth_sign_in', provider: 'apple' },
    });
    expect(JSON.stringify(m.capture.mock.calls)).not.toContain(RELAY);

    m.profile = { data: { full_name: 'Ada', onboarded: true }, error: null };
    m.capture.mockClear();
    const res = await callback('?code=abc&oauth=apple&next=%2Fclaim%2Freal-settlement');
    expect(res.headers.get('location')).toBe(`${ORIGIN}/claim/real-settlement`);
    expect(m.capture.mock.calls[0][0]).toMatchObject({ event: 'login_completed', properties: { provider: 'apple' } });
  });

  it('a canceled or failed Apple sign-in goes back to log in, naming Apple', async () => {
    const canceled = location(await callback('?oauth=apple&next=%2Fclaim%2Fx&error=access_denied'));
    expect(canceled.pathname).toBe('/login');
    expect(canceled.searchParams.get('oauth')).toBe('failed');
    expect(canceled.searchParams.get('provider')).toBe('apple');
    expect(canceled.searchParams.get('next')).toBe('/claim/x');

    m.exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid grant' }, data: null });
    const failed = location(await callback('?code=abc&oauth=apple'));
    expect(failed.searchParams.get('oauth')).toBe('failed');
    expect(failed.searchParams.get('provider')).toBe('apple');
  });

  it('leaves Google’s failure URL as it was', async () => {
    const canceled = location(await callback('?oauth=google&error=access_denied'));
    expect(canceled.searchParams.get('oauth')).toBe('failed');
    expect(canceled.searchParams.has('provider')).toBe(false);
  });
});
