import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cookieUser: null as { id: string } | null,
  cookieClients: 0,
  bearerUser: null as { id: string } | null,
  bearerError: null as Error | null,
  built: [] as { url: string; key: string; options: Record<string, unknown> }[],
  checked: [] as unknown[][],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    h.cookieClients += 1;
    return { name: 'cookie client', auth: { getUser: async () => ({ data: { user: h.cookieUser } }) } };
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, options: Record<string, unknown>) => {
    h.built.push({ url, key, options });
    return {
      name: 'bearer client',
      auth: {
        getUser: async (...args: unknown[]) => {
          h.checked.push(args);
          return { data: { user: h.bearerUser }, error: h.bearerError };
        },
      },
    };
  },
}));

import { createBearerClient, getRequestUser } from '@/lib/supabase/request-user';

// The real auth-js error classes, as supabase.auth.getUser(jwt) returns them.
const {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');

const JWT = 'app-header.app-payload.app-signature';

function request(authorization?: string) {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  h.cookieUser = { id: 'user-a' };
  h.cookieClients = 0;
  h.bearerUser = { id: 'user-b' };
  h.bearerError = null;
  h.built = [];
  h.checked = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getRequestUser: cookie session', () => {
  it('uses the cookie client when there is no Authorization header', async () => {
    expect(await getRequestUser(request())).toMatchObject({
      user: { id: 'user-a' },
      supabase: { name: 'cookie client' },
      via: 'cookie',
    });
    expect(await getRequestUser()).toMatchObject({ user: { id: 'user-a' }, via: 'cookie' });
    expect(h.built).toHaveLength(0);
  });

  it('returns no user and no client when signed out', async () => {
    h.cookieUser = null;
    expect(await getRequestUser(request())).toEqual({ user: null, supabase: null, via: 'cookie' });
  });

  it('leaves other schemes to the cookie session', async () => {
    expect(await getRequestUser(request('Basic dXNlcjpwYXNz'))).toMatchObject({
      user: { id: 'user-a' },
      via: 'cookie',
    });
    expect(h.built).toHaveLength(0);
  });
});

describe('getRequestUser: bearer token', () => {
  it('checks the token with Supabase Auth and binds it to a new client, never building the cookie client', async () => {
    h.cookieUser = null;
    expect(await getRequestUser(request(`Bearer ${JWT}`))).toMatchObject({
      user: { id: 'user-b' },
      supabase: { name: 'bearer client' },
      via: 'bearer',
    });
    expect(h.cookieClients).toBe(0);
    expect(h.checked).toEqual([[JWT]]);
    expect(h.built).toHaveLength(1);
    expect(h.built[0].options).toEqual({
      global: { headers: { Authorization: `Bearer ${JWT}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('lets the bearer user win over a cookie for someone else', async () => {
    const auth = await getRequestUser(request(`Bearer ${JWT}`));
    expect(auth).toMatchObject({ user: { id: 'user-b' }, via: 'bearer' });
    expect(h.cookieClients).toBe(0);
  });

  it('accepts the scheme in any letter case', async () => {
    for (const scheme of ['bearer', 'BEARER']) {
      expect(await getRequestUser(request(`${scheme} ${JWT}`))).toMatchObject({ user: { id: 'user-b' } });
    }
  });

  it.each([
    ['one segment', 'Bearer abc'],
    ['two segments', 'Bearer a.b'],
    ['text after the token', 'Bearer a.b.c d'],
    ['four segments', 'Bearer a.b.c.d'],
    ['a character outside base64url', 'Bearer a.b.c+d'],
    ['an empty token', 'Bearer '],
    ['two tokens', `Bearer ${JWT}, Bearer ${JWT}`],
    ['a comma after the scheme', `Bearer,${JWT}`],
    ['a semicolon after the scheme', `Bearer;${JWT}`],
    ['an equals sign after the scheme', `Bearer=${JWT}`],
    ['a quoted token', `Bearer"${JWT}"`],
    ['no space after the scheme', `Bearer${JWT}`],
  ])('refuses a malformed bearer header (%s) and never falls back to the cookie', async (_label, header) => {
    expect(await getRequestUser(request(header))).toEqual({ user: null, supabase: null, via: 'bearer' });
    expect(h.cookieClients).toBe(0);
    expect(h.built).toHaveLength(0);
  });

  it.each([
    ['an expired or forged token', () => new AuthApiError('invalid JWT: token has invalid claims: token is expired', 403, 'bad_jwt')],
    ['a deleted user', () => new AuthApiError('User from sub claim in JWT does not exist', 403, 'user_not_found')],
    ['a signed-out session (session_not_found)', () => new AuthSessionMissingError()],
    ['an older Auth server', () => new AuthApiError('invalid JWT', 401, undefined)],
    ['a bad sub claim', () => new AuthApiError('invalid claim: sub claim must be a UUID', 400, 'bad_jwt')],
  ])('returns no user when Supabase Auth rejects the token (%s)', async (_label, rejection) => {
    h.bearerUser = null;
    h.bearerError = rejection();
    expect(await getRequestUser(request(`Bearer ${JWT}`))).toEqual({ user: null, supabase: null, via: 'bearer' });
    // An error wins even if a user came back with it.
    h.bearerUser = { id: 'user-b' };
    expect(await getRequestUser(request(`Bearer ${JWT}`))).toEqual({ user: null, supabase: null, via: 'bearer' });
    expect(h.cookieClients).toBe(0);
  });

  it.each([
    ['Auth unreachable', () => new AuthRetryableFetchError('fetch failed', 0)],
    ['Auth answering 503', () => new AuthRetryableFetchError('Service Unavailable', 503)],
    ['Auth rate-limiting the server', () => new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')],
    ['an Auth 5xx outside the retryable list', () => new AuthApiError('HTTP Version Not Supported', 505, undefined)],
    ['a proxy error page that is not JSON', () => new AuthUnknownError('Unexpected token <', new SyntaxError('<'))],
  ])('reports "unavailable", not a rejection, when Auth cannot check the token (%s)', async (_label, outage) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      h.bearerUser = null;
      h.bearerError = outage();
      expect(await getRequestUser(request(`Bearer ${JWT}`))).toEqual({
        user: null,
        supabase: null,
        via: 'bearer',
        unavailable: true,
      });
      expect(h.cookieClients).toBe(0);
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(JWT);
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe('createBearerClient', () => {
  it('uses the anon key, never the service role key, with placeholders when Supabase is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    createBearerClient(JWT);
    expect(h.built[0]).toMatchObject({ url: 'https://project.supabase.co', key: 'anon-key' });

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    createBearerClient(JWT);
    expect(h.built[1]).toMatchObject({ url: 'https://placeholder.supabase.co', key: 'placeholder-anon-key' });
  });
});
