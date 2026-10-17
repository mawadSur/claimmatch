import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeUnsubscribeToken } from '@/lib/unsubscribe';

// A fake service client that records the opt-out update.
const db = vi.hoisted(() => {
  const state = {
    calls: [] as { table: string; values: unknown; column: string; emails: string[]; select: string }[],
    result: { data: [{ id: 'user-1' }], error: null } as {
      data: unknown;
      error: null | { code?: string; message: string };
    },
    throwError: null as Error | null,
  };
  const createServiceClient = () => ({
    from(table: string) {
      return {
        update(values: unknown) {
          return {
            in(column: string, emails: string[]) {
              return {
                async select(select: string) {
                  state.calls.push({ table, values, column, emails, select });
                  if (state.throwError) throw state.throwError;
                  return state.result;
                },
              };
            },
          };
        },
      };
    },
  });
  return { state, createServiceClient: vi.fn(createServiceClient) };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: db.createServiceClient,
  createClient: vi.fn(),
  isSupabaseConfigured: () => true,
}));

import { GET, POST } from '@/app/api/unsubscribe/route';

const EMAIL = 'Jane.Doe@Example.com';
const TOKEN = encodeUnsubscribeToken(EMAIL);
let ipCounter = 0;

function form(fields: Record<string, string>, ip?: string, query = ''): Request {
  return new Request(`https://claimmatch.test/api/unsubscribe${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}`,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function location(res: Response): string {
  const url = new URL(res.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.state.calls = [];
  db.state.result = { data: [{ id: 'user-1' }], error: null };
  db.state.throwError = null;
  db.createServiceClient.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

function loggedText(): string {
  return JSON.stringify(errorLog.mock.calls.map((args: unknown[]) => args.map((a) => String(a))));
}

describe('GET /api/unsubscribe', () => {
  it('changes nothing and sends a token to the confirm page', async () => {
    const res = await GET(new Request(`https://claimmatch.test/api/unsubscribe?e=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`/unsubscribe?e=${TOKEN}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(db.createServiceClient).not.toHaveBeenCalled();
    expect(db.state.calls).toHaveLength(0);
  });

  it('sends a bare GET to the page', async () => {
    const res = await GET(new Request('https://claimmatch.test/api/unsubscribe'));
    expect(location(res)).toBe('/unsubscribe');
    expect(db.state.calls).toHaveLength(0);
  });

  it('sends a bad token to the error view', async () => {
    const res = await GET(new Request('https://claimmatch.test/api/unsubscribe?e=%%%'));
    expect(location(res)).toBe('/unsubscribe?error=invalid');
    expect(db.state.calls).toHaveLength(0);
  });
});

describe('POST /api/unsubscribe', () => {
  it('turns off email for the address and confirms', async () => {
    const res = await POST(form({ e: TOKEN }));
    expect(res.status).toBe(303);
    expect(location(res)).toBe('/unsubscribe?done=1');
    expect(db.state.calls).toEqual([
      {
        table: 'profiles',
        values: { email_opt_in: false },
        column: 'email',
        emails: ['Jane.Doe@Example.com', 'jane.doe@example.com'],
        select: 'id',
      },
    ]);
  });

  it('answers the same when no account uses the address', async () => {
    db.state.result = { data: [], error: null };
    const res = await POST(form({ e: TOKEN }));
    expect(location(res)).toBe('/unsubscribe?done=1');
  });

  it('accepts the token in the query string (one-click shape)', async () => {
    const res = await POST(
      new Request(`https://claimmatch.test/api/unsubscribe?e=${TOKEN}`, {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.1.0.1' },
      }),
    );
    expect(location(res)).toBe('/unsubscribe?done=1');
    expect(db.state.calls).toHaveLength(1);
  });

  it('prefers the form field over the query string', async () => {
    const other = encodeUnsubscribeToken('other@example.com');
    await POST(form({ e: TOKEN }, undefined, `?e=${other}`));
    expect(db.state.calls[0].emails).toContain('Jane.Doe@Example.com');
  });

  it('refuses a bad or missing token without touching the database', async () => {
    const cases: Record<string, string>[] = [{ e: 'not a token!' }, { e: '' }, {}];
    for (const fields of cases) {
      const res = await POST(form(fields));
      expect(location(res)).toBe('/unsubscribe?error=invalid');
    }
    expect(db.createServiceClient).not.toHaveBeenCalled();
  });

  it('offers a retry when the update fails, and logs no address', async () => {
    db.state.result = {
      data: null,
      error: { code: '42501', message: `permission denied for email=in.(${EMAIL})` },
    };
    const res = await POST(form({ e: TOKEN }));
    expect(location(res)).toBe(`/unsubscribe?e=${TOKEN}&error=failed`);
    expect(errorLog).toHaveBeenCalled();
    expect(loggedText()).toContain('42501');
    expect(loggedText()).not.toContain(EMAIL);
    expect(loggedText()).not.toContain(EMAIL.toLowerCase());
    expect(loggedText()).not.toContain(TOKEN);
  });

  it('offers a retry when the client throws, and logs no address', async () => {
    db.state.throwError = new TypeError(`fetch failed for ${EMAIL}`);
    const res = await POST(form({ e: TOKEN }));
    expect(location(res)).toBe(`/unsubscribe?e=${TOKEN}&error=failed`);
    expect(loggedText()).not.toContain(EMAIL);
  });

  it('does not claim success without the service role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const res = await POST(form({ e: TOKEN }));
    expect(location(res)).toBe(`/unsubscribe?e=${TOKEN}&error=failed`);
    expect(db.createServiceClient).not.toHaveBeenCalled();
    expect(loggedText()).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('slows down repeated posts from one address', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 10; i++) {
      expect(location(await POST(form({ e: TOKEN }, ip)))).toBe('/unsubscribe?done=1');
    }
    const res = await POST(form({ e: TOKEN }, ip));
    expect(location(res)).toBe(`/unsubscribe?e=${TOKEN}&error=busy`);
    expect(db.state.calls).toHaveLength(10);
  });
});
