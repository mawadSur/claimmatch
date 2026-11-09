import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cookieUser: null as { id: string } | null,
  cookieClients: 0,
  bearerUser: null as { id: string } | null,
  authDown: false,
  checked: [] as string[],
  stored: {} as Record<string, unknown>,
  reads: [] as { client: string; table: string; columns: string; filters: unknown[][] }[],
  updates: [] as { client: string; table: string; patch: Record<string, unknown>; where: unknown[] }[],
}));

// Just the two queries /api/settings runs on the caller's client: read the
// stored attributes, then update the profile row.
const fake = vi.hoisted(() => ({
  client: (name: string, getUser: (jwt?: string) => Promise<unknown>) => ({
    auth: { getUser },
    from: (table: string) => ({
      select: (columns: string) => {
        const read = { client: name, table, columns, filters: [] as unknown[][] };
        h.reads.push(read);
        const chain = {
          eq: (...filter: unknown[]) => {
            read.filters.push(filter);
            return chain;
          },
          maybeSingle: async () => ({ data: { attributes: h.stored }, error: null }),
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (...where: unknown[]) => {
          h.updates.push({ client: name, table, patch, where });
          return { error: null };
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    h.cookieClients += 1;
    return fake.client('cookie', async () => ({ data: { user: h.cookieUser } }));
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () =>
    fake.client('bearer', async (jwt?: string) => {
      h.checked.push(jwt ?? '');
      if (h.bearerUser) return { data: { user: h.bearerUser }, error: null };
      return {
        data: { user: null },
        error: h.authDown
          ? { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
          : { name: 'AuthApiError', message: 'invalid JWT', status: 403, code: 'bad_jwt' },
      };
    }),
}));

import { POST } from '@/app/api/settings/route';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';

const JWT = 'app-header.app-payload.app-signature';

function save(body: unknown, authorization?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (authorization) headers.authorization = authorization;
  return POST(new Request('http://localhost/api/settings', { method: 'POST', headers, body: JSON.stringify(body) }));
}

// The rate limiter is the real one, keyed by user id, so every test gets
// users of its own.
let n = 0;
let cookieId = '';
let appId = '';

beforeEach(() => {
  n += 1;
  cookieId = `web-user-${n}`;
  appId = `app-user-${n}`;
  h.cookieUser = { id: cookieId };
  h.bearerUser = { id: appId };
  h.authDown = false;
  h.cookieClients = 0;
  h.checked = [];
  h.stored = {};
  h.reads = [];
  h.updates = [];
});

describe('POST /api/settings', () => {
  it('saves for the bearer user with the token client, even with a cookie for someone else', async () => {
    const res = await save({ full_name: '  Jo App ', email_opt_in: false }, `Bearer ${JWT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.checked).toEqual([JWT]);
    expect(h.cookieClients).toBe(0);
    expect(h.updates).toEqual([
      { client: 'bearer', table: 'profiles', patch: { full_name: 'Jo App', email_opt_in: false }, where: ['id', appId] },
    ]);
  });

  it('answers 401 to a malformed or rejected bearer token and never falls back to the cookie', async () => {
    for (const authorization of ['Bearer abc', 'Bearer a.b', `Bearer ${JWT} extra`]) {
      const res = await save({ full_name: 'Jo' }, authorization);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Please log in again to save your settings.');
    }
    expect(h.checked).toEqual([]);
    h.bearerUser = null;
    expect((await save({ full_name: 'Jo' }, `Bearer ${JWT}`)).status).toBe(401);
    expect(h.cookieClients).toBe(0);
    expect(h.updates).toEqual([]);
  });

  it('drops the retired SMS opt-in', async () => {
    const alone = await save({ sms_opt_in: true }, `Bearer ${JWT}`);
    expect(alone.status).toBe(200);
    expect(h.updates).toEqual([]);
    expect((await save({ sms_opt_in: true, email_opt_in: true }, `Bearer ${JWT}`)).status).toBe(200);
    expect(h.updates.map((u) => u.patch)).toEqual([{ email_opt_in: true }]);
  });

  it('persists onboarded: true for the app\'s "Skip for now" and saved onboarding answers', async () => {
    expect((await save({ onboarded: true }, `Bearer ${JWT}`)).status).toBe(200);
    expect(h.reads).toEqual([]);

    // Stored answers the app's save must merge into, not replace: a managed
    // key it omits is cleared, a key it does not manage stays.
    h.stored = { had_data_breach: false, owns_vehicle: true, legacy_note: 'keep' };
    const answers = { full_name: 'Jo App', state: 'tx', attributes: { had_data_breach: true }, onboarded: true };
    expect((await save(answers, `Bearer ${JWT}`)).status).toBe(200);
    expect(h.reads).toEqual([{ client: 'bearer', table: 'profiles', columns: 'attributes', filters: [['id', appId]] }]);
    expect(h.updates).toEqual([
      { client: 'bearer', table: 'profiles', patch: { onboarded: true }, where: ['id', appId] },
      {
        client: 'bearer',
        table: 'profiles',
        patch: {
          full_name: 'Jo App',
          state: 'TX',
          attributes: { legacy_note: 'keep', had_data_breach: true },
          onboarded: true,
        },
        where: ['id', appId],
      },
    ]);
  });

  it('refuses to un-mark onboarding and writes nothing', async () => {
    const res = await save({ onboarded: false, full_name: 'Jo' }, `Bearer ${JWT}`);
    expect(res.status).toBe(400);
    expect(h.updates).toEqual([]);
  });

  it('still saves with the web cookie session', async () => {
    expect((await save({ state: 'ca' })).status).toBe(200);
    expect(h.updates).toEqual([{ client: 'cookie', table: 'profiles', patch: { state: 'CA' }, where: ['id', cookieId] }]);
    expect(h.checked).toEqual([]);
    h.cookieUser = null;
    expect((await save({ state: 'ca' })).status).toBe(401);
  });

  it('answers 503, not 401, when Supabase Auth cannot check the token, and writes nothing', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.bearerUser = null;
    h.authDown = true;
    const res = await save({ full_name: 'Jo' }, `Bearer ${JWT}`);
    errorLog.mockRestore();
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(AUTH_UNAVAILABLE);
    expect(h.cookieClients).toBe(0);
    expect(h.updates).toEqual([]);
  });

  it('refuses a body that is not sent as JSON, such as a same-site form post, and writes nothing', async () => {
    for (const contentType of [
      'text/plain',
      'text/plain; x=application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      '',
    ]) {
      const res = await save({ full_name: 'Changed by a form' }, undefined, contentType);
      expect(res.status, contentType).toBe(415);
      expect(await res.json()).toEqual({ error: 'Send the request as JSON.' });
    }
    expect(h.updates).toEqual([]);
    expect((await save({ full_name: 'Jo' }, undefined, 'application/json; charset=utf-8')).status).toBe(200);
  });

  it('allows 20 saves a minute per user, then answers 429 with Retry-After', async () => {
    for (let i = 0; i < 20; i += 1) {
      expect((await save({ email_opt_in: true }, `Bearer ${JWT}`)).status).toBe(200);
    }
    const limited = await save({ email_opt_in: true }, `Bearer ${JWT}`);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await limited.json()).error).toBe('Too many requests. Please wait a moment and try again.');
    expect(h.updates).toHaveLength(20);
    // Someone else still has a full allowance.
    expect((await save({ email_opt_in: true })).status).toBe(200);
  });
});
