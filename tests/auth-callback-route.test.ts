import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

vi.mock('@/lib/session-flags', () => ({
  applySessionFlags: vi.fn().mockResolvedValue({ internal: false, cohort: null }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: m.exchangeCodeForSession } }),
}));

import { GET } from '@/app/auth/callback/route';

const ORIGIN = 'https://claimmatch.test';

function callback(query: string, cookie?: string) {
  return GET(
    new NextRequest(`${ORIGIN}/auth/callback${query}`, cookie ? { headers: { cookie } } : undefined),
  );
}

beforeEach(() => {
  m.exchangeCodeForSession.mockReset();
  m.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe('/auth/callback', () => {
  it('signs the person in and brings them back to the claim they picked before signing up', async () => {
    const res = await callback('?code=abc', 'cm_next=%2Fclaim%2Freal-settlement');
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(res.headers.get('location')).toBe(
      `${ORIGIN}/onboarding?next=%2Fclaim%2Freal-settlement&confirmed=1`,
    );
    // The cookie is used up.
    expect(res.headers.get('set-cookie')).toMatch(/cm_next=;/);
  });

  it('goes to onboarding when nothing was saved, and never off the site', async () => {
    expect((await callback('?code=abc')).headers.get('location')).toBe(`${ORIGIN}/onboarding?confirmed=1`);
    expect((await callback('?code=abc&next=%2F%5Cevil.example')).headers.get('location')).toBe(
      `${ORIGIN}/onboarding?confirmed=1`,
    );
    expect((await callback('?code=abc', 'cm_next=%2F%2Fevil.example')).headers.get('location')).toBe(
      `${ORIGIN}/onboarding?confirmed=1`,
    );
  });

  it('sends people to log in, then on, when the link was opened in another browser', async () => {
    m.exchangeCodeForSession.mockResolvedValue({ error: { message: 'code verifier missing' } });
    const res = await callback('?code=abc', 'cm_next=%2Fclaim%2Fx');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('confirmed')).toBe('1');
    expect(location.searchParams.get('next')).toBe('/onboarding?next=%2Fclaim%2Fx');
  });

  it('says so when the link expired', async () => {
    const res = await callback('?error=access_denied&error_code=otp_expired');
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('link')).toBe('expired');
    expect(m.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('a confirmation code left on the homepage', () => {
  it('forwards /?code= to /auth/callback so the session can be started', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(new NextRequest(`${ORIGIN}/?code=abc&next=%2Fonboarding`));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/auth/callback');
    expect(location.searchParams.get('code')).toBe('abc');
    expect(location.searchParams.get('next')).toBe('/onboarding');
  });
});

describe('the login redirect for signed-out visitors', () => {
  it('keeps the whole path, query included, as ?next', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const { updateSession } = await import('@/lib/supabase/middleware');
    const res = await updateSession(new NextRequest(`${ORIGIN}/onboarding?next=%2Fclaim%2Fx`));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect([...location.searchParams.keys()]).toEqual(['next']);
    expect(location.searchParams.get('next')).toBe('/onboarding?next=%2Fclaim%2Fx');
    vi.unstubAllEnvs();
  });
});
