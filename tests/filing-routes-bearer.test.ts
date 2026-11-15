import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The app calls the same /api/filing routes as the web, with its bearer
 * token (issue #51). Every route that reads a user goes through
 * getRequestUser (directly, or through beginFilingRoute for
 * /api/filing/claims/**), never the cookie-only Supabase client.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILING = path.join(ROOT, 'src', 'app', 'api', 'filing');

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === 'route.ts' ? [full] : [];
  });
}

const h = vi.hoisted(() => ({
  bearerUser: null as { id: string } | null,
  cookieUser: null as { id: string } | null,
  authDown: false,
  jobsFor: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.cookieUser } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        h.bearerUser
          ? { data: { user: h.bearerUser }, error: null }
          : {
              data: { user: null },
              error: h.authDown
                ? { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
                : { name: 'AuthApiError', message: 'invalid JWT', status: 403 },
            },
    },
  }),
}));
vi.mock('@/lib/filing/queue', () => ({
  listUserFilingJobs: async (userId: string) => {
    h.jobsFor.push(userId);
    return [{ id: 'job-1' }];
  },
}));

import { GET as status } from '@/app/api/filing/status/route';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';

const TOKEN = 'Bearer app-header.app-payload.app-signature';
const get = (authorization?: string) =>
  status(new Request('http://localhost/api/filing/status', { headers: authorization ? { authorization } : {} }));

describe('every /api/filing route accepts the app bearer token', () => {
  const files = routes(FILING);

  it('finds the member routes', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  it.each(files.map((file) => [path.relative(ROOT, file), file]))('%s reads the caller through getRequestUser', (_name, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/from '@\/lib\/supabase\/server'/);
    // The retired authorize route reads nobody (410 for everyone).
    if (file.includes(`${path.sep}authorize${path.sep}`)) return;
    expect(/beginFilingRoute\(|getRequestUser\(/.test(text)).toBe(true);
  });
});

describe('GET /api/filing/status', () => {
  beforeEach(() => {
    vi.stubEnv('ASSISTED_FILING_ENABLED', '1');
    h.bearerUser = null;
    h.cookieUser = null;
    h.authDown = false;
    h.jobsFor = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists the bearer user’s jobs, never the cookie user’s', async () => {
    h.bearerUser = { id: 'user-app' };
    h.cookieUser = { id: 'user-web' };
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobs: [{ id: 'job-1' }] });
    expect(h.jobsFor).toEqual(['user-app']);
  });

  it('still reads the web session cookie', async () => {
    h.cookieUser = { id: 'user-web' };
    expect((await get()).status).toBe(200);
    expect(h.jobsFor).toEqual(['user-web']);
  });

  it('answers 401 for a rejected or malformed token, without falling back to the cookie', async () => {
    h.cookieUser = { id: 'user-web' };
    expect((await get(TOKEN)).status).toBe(401);
    expect((await get('Bearer a.b')).status).toBe(401);
    expect(h.jobsFor).toEqual([]);
  });

  it('answers 503 when Supabase Auth cannot check the token', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.authDown = true;
    const res = await get(TOKEN);
    log.mockRestore();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(AUTH_UNAVAILABLE);
  });

  it('answers no jobs while assisted filing is off, before reading anyone', async () => {
    vi.stubEnv('ASSISTED_FILING_ENABLED', '0');
    h.bearerUser = { id: 'user-app' };
    expect(await (await get(TOKEN)).json()).toEqual({ jobs: [] });
    expect(h.jobsFor).toEqual([]);
  });
});
