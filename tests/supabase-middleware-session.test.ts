import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: m.createServerClient,
}));

import {
  hasSupabaseAuthCookie,
  updateSession,
} from '@/lib/supabase/middleware';

const ORIGIN = 'https://lawsuitai.org';

function request(path: string, cookie?: string) {
  const headers = cookie ? { cookie } : undefined;
  return new NextRequest(`${ORIGIN}${path}`, headers ? { headers } : undefined);
}

beforeEach(() => {
  m.getUser.mockReset();
  m.createServerClient.mockReset();
  m.createServerClient.mockImplementation(() => ({
    auth: { getUser: m.getUser },
  }));
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hasSupabaseAuthCookie', () => {
  it('detects chunked sb auth cookies', () => {
    expect(
      hasSupabaseAuthCookie(
        request('/', 'sb-abc-auth-token.0=chunk; sb-abc-auth-token.1=chunk'),
      ),
    ).toBe(true);
  });

  it('ignores unrelated cookies', () => {
    expect(hasSupabaseAuthCookie(request('/', 'theme=dark; ph_phc=x'))).toBe(false);
  });
});

describe('updateSession Active CPU short-circuit', () => {
  it('skips getUser on anonymous public traffic', async () => {
    const res = await updateSession(request('/lawsuits'));
    expect(m.createServerClient).not.toHaveBeenCalled();
    expect(m.getUser).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects protected anonymous traffic without getUser', async () => {
    const res = await updateSession(request('/dashboard'));
    expect(m.createServerClient).not.toHaveBeenCalled();
    expect(m.getUser).not.toHaveBeenCalled();
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });

  it('refreshes the session when an auth cookie is present', async () => {
    m.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const res = await updateSession(
      request('/lawsuits', 'sb-abc-auth-token=eyJhbGciOiJIUzI1NiJ9.payload.sig'),
    );
    expect(m.createServerClient).toHaveBeenCalledOnce();
    expect(m.getUser).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});
