import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Op =
  | { op: 'insert'; table: string; row: unknown }
  | { op: 'delete'; table: string; column?: string; value?: unknown }
  | { op: 'removeFiles'; bucket: string; paths: string[] }
  | { op: 'deleteUser'; id: string };

const h = vi.hoisted(() => ({
  cookieUser: null as { id: string } | null,
  cookieClients: 0,
  bearerUser: null as { id: string } | null,
  authDown: false,
  ops: [] as Op[],
  deleteUserError: null as { message: string } | null,
  /** claim_documents rows (0037) the route reads before deleting rows. */
  documents: [] as Array<{ storage_path: string }>,
}));

// The service client records every write the route makes, in order. A delete
// is recorded when it starts, so one with a filter other than eq (which this
// fake lacks, and the route's per-table catch would swallow) still shows.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    h.cookieClients += 1;
    return { auth: { getUser: async () => ({ data: { user: h.cookieUser } }) } };
  },
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: table === 'claim_documents' ? h.documents : [], error: null }) }),
      }),
      insert: async (row: unknown) => {
        h.ops.push({ op: 'insert', table, row });
        return { error: null };
      },
      delete: () => {
        const op: Op = { op: 'delete', table };
        h.ops.push(op);
        return {
          eq: async (column: string, value: unknown) => {
            Object.assign(op, { column, value });
            return { error: null };
          },
        };
      },
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          h.ops.push({ op: 'removeFiles', bucket, paths });
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          h.ops.push({ op: 'deleteUser', id });
          return { error: h.deleteUserError };
        },
      },
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (h.bearerUser) return { data: { user: h.bearerUser }, error: null };
        return {
          data: { user: null },
          error: h.authDown
            ? { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
            : { name: 'AuthApiError', message: 'invalid JWT', status: 403, code: 'bad_jwt' },
        };
      },
    },
  }),
}));

import { POST } from '@/app/api/account/delete/route';
import { CASCADE_ONLY_TABLES, EXPLICIT_DELETE_ORDER } from '@/lib/account-deletion';
import { rateLimit } from '@/lib/ratelimit';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';

const JWT = 'app-header.app-payload.app-signature';

function remove(body: unknown = { confirm: 'DELETE' }, authorization?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (authorization) headers.authorization = authorization;
  return POST(
    new Request('http://localhost/api/account/delete', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const deletedTables = () => h.ops.flatMap((o) => (o.op === 'delete' ? [o.table] : []));

// The rate limiter is the real one (3 per 10 minutes per user), so every test
// gets users of its own.
let n = 0;
let webId = '';
let appId = '';
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  n += 1;
  webId = `web-user-${n}`;
  appId = `app-user-${n}`;
  h.cookieUser = { id: webId };
  h.bearerUser = { id: appId };
  h.authDown = false;
  h.cookieClients = 0;
  h.ops = [];
  h.deleteUserError = null;
  h.documents = [];
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorLog.mockRestore();
});

describe('POST /api/account/delete', () => {
  it('writes the audit row, deletes owned rows in EXPLICIT_DELETE_ORDER, then the auth user', async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.ops).toEqual([
      { op: 'insert', table: 'account_deletion_audit', row: { reason: 'self_serve' } },
      ...EXPLICIT_DELETE_ORDER.map((table) => ({
        op: 'delete',
        table,
        column: table === 'referrals' ? 'referrer_id' : 'user_id',
        value: webId,
      })),
      { op: 'deleteUser', id: webId },
    ]);
    expect(h.ops).toContainEqual({ op: 'delete', table: 'referrals', column: 'referrer_id', value: webId });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('removes the account’s one-click files from Storage before their rows, and nothing outside its folder', async () => {
    h.documents = [
      { storage_path: `${webId}/claim-1/doc-1.pdf` },
      { storage_path: `${webId}/claim-1/evidence/shot-1.png` },
      { storage_path: 'someone-else/claim-9/doc-9.pdf' },
    ];
    expect((await remove()).status).toBe(200);
    const removed = h.ops.findIndex((o) => o.op === 'removeFiles');
    expect(h.ops[removed]).toEqual({
      op: 'removeFiles',
      bucket: 'claim-documents',
      paths: [`${webId}/claim-1/doc-1.pdf`, `${webId}/claim-1/evidence/shot-1.png`],
    });
    expect(removed).toBeLessThan(h.ops.findIndex((o) => o.op === 'delete' && o.table === 'claim_documents'));
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('never deletes the profile or claim events itself: they cascade from the auth user', async () => {
    expect((await remove()).status).toBe(200);
    expect(deletedTables()).not.toContain('profiles');
    expect(deletedTables()).not.toContain('claim_events');
    for (const table of CASCADE_ONLY_TABLES) expect(deletedTables()).not.toContain(table);
  });

  it('answers 500 and leaves the profile when deleting the auth user fails', async () => {
    h.deleteUserError = { message: 'auth admin unavailable' };
    const res = await remove();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not finish deleting the account.' });
    expect(h.ops.at(-1)).toEqual({ op: 'deleteUser', id: webId });
    expect(deletedTables()).not.toContain('profiles');
  });

  it("accepts the app's bearer token and deletes that user, never the cookie's", async () => {
    const res = await remove({ confirm: 'DELETE' }, `Bearer ${JWT}`);
    expect(res.status).toBe(200);
    expect(h.cookieClients).toBe(0);
    const owners = h.ops.flatMap((o) => (o.op === 'delete' ? [o.value] : o.op === 'deleteUser' ? [o.id] : []));
    expect(owners.length).toBe(EXPLICIT_DELETE_ORDER.length + 1);
    expect(new Set(owners)).toEqual(new Set([appId]));
  });

  it('deletes nothing for a malformed or rejected bearer token, a signed-out caller, or a missing DELETE', async () => {
    for (const authorization of ['Bearer abc', `Bearer ${JWT} extra`]) {
      expect((await remove({ confirm: 'DELETE' }, authorization)).status).toBe(401);
    }
    h.bearerUser = null;
    expect((await remove({ confirm: 'DELETE' }, `Bearer ${JWT}`)).status).toBe(401);
    expect(h.cookieClients).toBe(0);
    h.cookieUser = null;
    expect((await remove()).status).toBe(401);
    h.cookieUser = { id: webId };
    for (const body of [{ confirm: 'delete' }, ['DELETE']]) {
      const res = await remove(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Type DELETE to confirm.' });
    }
    expect(h.ops).toEqual([]);
  });

  it('deletes nothing and answers 503, not 401, when Supabase Auth cannot check the token', async () => {
    h.bearerUser = null;
    h.authDown = true;
    const res = await remove({ confirm: 'DELETE' }, `Bearer ${JWT}`);
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(AUTH_UNAVAILABLE);
    expect(h.cookieClients).toBe(0);
    expect(h.ops).toEqual([]);
  });

  it('deletes nothing for a body not sent as JSON, such as a same-site text/plain form post', async () => {
    // What <form enctype="text/plain"> sends for name='{"confirm":"DELETE","x":"' value='"}'.
    const formBody = '{"confirm":"DELETE","x":"="}';
    for (const contentType of [
      'text/plain',
      'text/plain; x=application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
    ]) {
      h.cookieUser = { id: `${webId}-${contentType}` }; // each under the 3-attempt limit
      const res = await remove(formBody, undefined, contentType);
      expect(res.status, contentType).toBe(415);
      expect(await res.json()).toEqual({ error: 'Send the request as JSON.' });
    }
    expect(h.ops).toEqual([]);
  });

  it('allows 3 attempts per 10 minutes per user, then answers 429 with Retry-After', async () => {
    h.deleteUserError = { message: 'auth admin unavailable' };
    for (let i = 0; i < 3; i += 1) expect((await remove()).status).toBe(500);
    const limited = await remove();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({ error: 'Too many attempts. Please try again in 10 minutes.' });
    expect(h.ops.filter((o) => o.op === 'deleteUser')).toHaveLength(3);
  });

  it('keeps the 10-minute window when a 60-second limiter sweeps the shared store', async () => {
    // The store-wide sweep runs at most every 5 minutes, from whichever route
    // calls rateLimit first; here the settings limiter.
    h.deleteUserError = { message: 'auth admin unavailable' };
    const start = Date.now() + 60 * 60_000; // after any sweep the earlier tests ran
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(start);
      for (let i = 0; i < 3; i += 1) expect((await remove()).status).toBe(500);
      expect((await remove()).status).toBe(429);

      vi.setSystemTime(start + 5 * 60_000 + 1_000);
      expect(rateLimit(`settings:${webId}`, { limit: 20, windowMs: 60_000 }).ok).toBe(true);
      expect((await remove()).status).toBe(429);

      vi.setSystemTime(start + 10 * 60_000 + 1_000);
      expect((await remove()).status).toBe(500);
      expect(h.ops.filter((o) => o.op === 'deleteUser')).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
