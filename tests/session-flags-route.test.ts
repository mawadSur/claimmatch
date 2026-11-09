import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock('@/lib/session-flags', () => ({
  applySessionFlags: vi.fn().mockResolvedValue({ internal: true, cohort: null }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }),
}));

// The app's bearer path: Supabase Auth checks the token.
const b = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, authDown: false }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (b.user) return { data: { user: b.user }, error: null };
        return {
          data: { user: null },
          error: b.authDown
            ? { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
            : { name: 'AuthApiError', message: 'invalid JWT', status: 403, code: 'bad_jwt' },
        };
      },
    },
  }),
}));

import { applySessionFlags } from '@/lib/session-flags';
import { POST } from '@/app/api/session-flags/route';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';

describe('POST /api/session-flags', () => {
  it('returns 204 with no body for signed-out visitors (no console noise)', async () => {
    m.user = null;
    const res = await POST(new Request('http://localhost/api/session-flags', { method: 'POST' }));
    expect(res.status).toBe(204);
  });

  it('returns the flags for a signed-in user', async () => {
    m.user = { id: 'u1', email: 'a@b.test' };
    const res = await POST(new Request('http://localhost/api/session-flags', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, internal: true });
  });

  it('uses the app’s bearer token over a cookie, and treats a malformed one as signed out', async () => {
    const bearer = (token: string) =>
      POST(
        new Request('http://localhost/api/session-flags', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        }),
      );
    m.user = { id: 'u1', email: 'a@b.test' };
    b.user = { id: 'u2', email: 'c@d.test' };
    const res = await bearer('app-header.app-payload.app-signature');
    expect(res.status).toBe(200);
    expect(applySessionFlags).toHaveBeenLastCalledWith({ userId: 'u2', email: 'c@d.test' });

    vi.mocked(applySessionFlags).mockClear();
    expect((await bearer('not-a-token')).status).toBe(204);
    expect(applySessionFlags).not.toHaveBeenCalled();

    // Supabase Auth down is not "signed out": 503, so the app keeps its session.
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    b.user = null;
    b.authDown = true;
    const unavailable = await bearer('app-header.app-payload.app-signature');
    errorLog.mockRestore();
    b.authDown = false;
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
    expect(await unavailable.json()).toEqual(AUTH_UNAVAILABLE);
    expect(applySessionFlags).not.toHaveBeenCalled();
  });
});
