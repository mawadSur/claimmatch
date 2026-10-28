import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ verifyOtp: vi.fn(), applySessionFlags: vi.fn() }));

vi.mock('@/lib/session-flags', () => ({ applySessionFlags: m.applySessionFlags }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp: m.verifyOtp } }),
}));

import { POST } from '@/app/auth/confirm/verify/route';
import {
  confirmDestination,
  confirmFailure,
  parseConfirmType,
  parseTokenHash,
} from '@/lib/auth-confirm';

const ORIGIN = 'https://claimmatch.test';

function verify(fields: Record<string, string>, cookie?: string) {
  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.cookie = cookie;
  return POST(new NextRequest(`${ORIGIN}/auth/confirm/verify`, { method: 'POST', body, headers }));
}

beforeEach(() => {
  m.verifyOtp.mockReset();
  m.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.test' } }, error: null });
  m.applySessionFlags.mockReset();
  m.applySessionFlags.mockResolvedValue({ internal: false, cohort: null });
});

describe('auth-confirm helpers', () => {
  it('accepts only known link types and url-safe token hashes', () => {
    expect(parseConfirmType('signup')).toBe('signup');
    expect(parseConfirmType('recovery')).toBe('recovery');
    expect(parseConfirmType('magiclink-evil')).toBeNull();
    expect(parseConfirmType(undefined)).toBeNull();
    expect(parseTokenHash('pkce_abcdef0123456789')).toBe('pkce_abcdef0123456789');
    expect(parseTokenHash('short')).toBeNull();
    expect(parseTokenHash('abc def ghi jkl')).toBeNull();
    expect(parseTokenHash(['x'])).toBeNull();
  });

  it('sends signups to onboarding with confirmed=1 and recovery to reset-password', () => {
    expect(confirmDestination('signup', null, undefined)).toBe('/onboarding?confirmed=1');
    expect(confirmDestination('signup', null, '%2Fclaim%2Fx')).toBe(
      '/onboarding?next=%2Fclaim%2Fx&confirmed=1',
    );
    expect(confirmDestination('email', '//evil.example', undefined)).toBe('/onboarding?confirmed=1');
    expect(confirmDestination('recovery', '/admin', undefined)).toBe('/reset-password');
    expect(confirmFailure('recovery')).toBe('/forgot-password?link=expired');
    expect(confirmFailure('signup')).toBe('/login?link=expired');
  });
});

describe('POST /auth/confirm/verify', () => {
  it('verifies the token only on POST and lands on onboarding signed in', async () => {
    const res = await verify({ token_hash: 'pkce_abcdef0123456789', type: 'signup' }, 'cm_next=%2Fclaim%2Freal');
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_abcdef0123456789', type: 'signup' });
    expect(m.applySessionFlags).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.test' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/onboarding?next=%2Fclaim%2Freal&confirmed=1`);
    expect(res.headers.get('set-cookie')).toMatch(/cm_next=;/);
  });

  it('sends a verified recovery link to the reset-password page', async () => {
    const res = await verify({ token_hash: 'pkce_abcdef0123456789', type: 'recovery' });
    expect(res.headers.get('location')).toBe(`${ORIGIN}/reset-password`);
  });

  it('reports an expired or used link without signing in', async () => {
    m.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const res = await verify({ token_hash: 'pkce_abcdef0123456789', type: 'signup' });
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?link=expired`);
    expect(m.applySessionFlags).not.toHaveBeenCalled();

    const rec = await verify({ token_hash: 'pkce_abcdef0123456789', type: 'recovery' });
    expect(rec.headers.get('location')).toBe(`${ORIGIN}/forgot-password?link=expired`);
  });

  it('rejects a malformed request before calling Supabase', async () => {
    const res = await verify({ token_hash: 'bad token', type: 'signup' });
    expect(m.verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?link=expired`);
  });
});

describe('GET /auth/confirm page', () => {
  it('renders a button form and never verifies on open', async () => {
    const { default: ConfirmPage } = await import('@/app/auth/confirm/page');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const el = await ConfirmPage({
      searchParams: Promise.resolve({ token_hash: 'pkce_abcdef0123456789', type: 'signup' }),
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('action="/auth/confirm/verify"');
    expect(html).toContain('Confirm my email');
    expect(m.verifyOtp).not.toHaveBeenCalled();
  });
});
