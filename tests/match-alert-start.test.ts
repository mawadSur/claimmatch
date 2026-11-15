import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueMatchAlertToken } from '@/lib/match-alert-token';

const SECRET = 'start-token-secret';
const TOKEN_ID = 'tok-1';

const m = vi.hoisted(() => ({
  lawsuitId: '11111111-1111-4111-8111-111111111111',
  tokenRow: null as null | {
    id: string;
    email: string;
    lawsuit_id: string;
    expires_at: string;
    used_at: string | null;
  },
  updateUsed: true,
  lawsuit: { id: '11111111-1111-4111-8111-111111111111', slug: 'verified-open' } as {
    id: string;
    slug: string;
  } | null,
  generateLink: vi.fn(),
  createUser: vi.fn(),
  verifyOtp: vi.fn(),
  applySessionFlags: vi.fn(),
  updates: [] as Array<{ table: string; values: unknown }>,
}));

vi.mock('@/lib/session-flags', () => ({ applySessionFlags: m.applySessionFlags }));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createServiceClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op: 'select' | 'update' = 'select';
      let values: unknown = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return q;
      };
      q.is = () => q;
      q.update = (next: unknown) => {
        op = 'update';
        values = next;
        m.updates.push({ table, values: next });
        return q;
      };
      const finish = async () => {
        if (table === 'match_alert_tokens' && op === 'select') {
          return { data: m.tokenRow, error: null };
        }
        if (table === 'match_alert_tokens' && op === 'update') {
          if (!m.updateUsed) return { data: [], error: null };
          if (m.tokenRow) m.tokenRow.used_at = (values as { used_at: string }).used_at;
          return { data: [{ id: TOKEN_ID }], error: null };
        }
        if (table === 'lawsuits') {
          return { data: m.lawsuit, error: null };
        }
        if (table === 'subscribers') {
          return { data: { state: 'CA' }, error: null };
        }
        if (table === 'profiles' && op === 'update') {
          return { data: [{ id: 'user-new' }], error: null };
        }
        return { data: null, error: null };
      };
      q.maybeSingle = finish;
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        finish().then(resolve, reject);
      return q;
    },
    auth: {
      admin: {
        generateLink: m.generateLink,
        createUser: m.createUser,
      },
    },
  }),
  createClient: async () => ({
    auth: { verifyOtp: m.verifyOtp },
  }),
}));

import { GET, POST } from '@/app/api/match-alert/start/route';
import { consumeMatchAlertToken } from '@/lib/match-alert-start';

function issued(now = new Date('2026-11-12T12:00:00.000Z')) {
  return issueMatchAlertToken({
    email: 'ada@example.com',
    lawsuitId: m.lawsuitId,
    now,
    secret: SECRET,
    nonce: 'abcd1234efgh5678',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.updates = [];
  m.updateUsed = true;
  m.lawsuit = { id: m.lawsuitId, slug: 'verified-open' };
  const row = issued();
  m.tokenRow = {
    id: TOKEN_ID,
    email: 'ada@example.com',
    lawsuit_id: m.lawsuitId,
    expires_at: row.expiresAt.toISOString(),
    used_at: null,
  };
  m.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed', verification_type: 'magiclink' } },
    error: null,
  });
  m.createUser.mockResolvedValue({
    data: { user: { id: 'user-new' } },
    error: null,
  });
  m.verifyOtp.mockResolvedValue({ data: { user: { id: 'user-existing' } }, error: null });
  m.applySessionFlags.mockResolvedValue(undefined);
  vi.stubEnv('MATCH_ALERT_TOKEN_SECRET', SECRET);
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('consumeMatchAlertToken', () => {
  it('is single-use: a second consume of the same token fails', async () => {
    const { token } = issued();
    const req = new Request('https://claimmatch.test/api/match-alert/start', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const first = await consumeMatchAlertToken({ token, req, now: new Date('2026-11-12T12:00:00.000Z') });
    expect(first).toEqual({ ok: true, path: '/claim/verified-open', createdUser: false });
    const second = await consumeMatchAlertToken({
      token,
      req: new Request('https://claimmatch.test/api/match-alert/start', {
        headers: { 'x-forwarded-for': '203.0.113.11' },
      }),
      now: new Date('2026-11-12T12:01:00.000Z'),
    });
    expect(second).toEqual({ ok: false, error: 'used' });
  });

  it('creates an account without a password when generateLink finds no user', async () => {
    m.generateLink
      .mockResolvedValueOnce({ data: { properties: null }, error: { message: 'User not found' } })
      .mockResolvedValueOnce({
        data: { properties: { hashed_token: 'hashed', verification_type: 'magiclink' } },
        error: null,
      });
    const { token } = issued();
    const result = await consumeMatchAlertToken({
      token,
      req: new Request('https://claimmatch.test/api/match-alert/start', {
        headers: { 'x-forwarded-for': '203.0.113.12' },
      }),
      now: new Date('2026-11-12T12:00:00.000Z'),
    });
    expect(result).toEqual({ ok: true, path: '/claim/verified-open', createdUser: true });
    expect(m.createUser).toHaveBeenCalledWith({
      email: 'ada@example.com',
      email_confirm: true,
      user_metadata: { email_opt_in: true, match_alert_signup: true },
    });
    expect(m.createUser.mock.calls[0][0].password).toBeUndefined();
  });

  it('rejects an expired stored row', async () => {
    m.tokenRow = {
      ...m.tokenRow!,
      expires_at: '2026-11-10T00:00:00.000Z',
    };
    const { token } = issued();
    const result = await consumeMatchAlertToken({
      token,
      req: new Request('https://claimmatch.test/api/match-alert/start', {
        headers: { 'x-forwarded-for': '203.0.113.13' },
      }),
      now: new Date('2026-11-12T12:00:00.000Z'),
    });
    expect(result).toEqual({ ok: false, error: 'expired' });
  });
});

describe('one-click claim landing page', () => {
  it('keeps the POST confirm button, brands Lawsuit AI, and reads as one tap', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/app/match-alert/start/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(src).toContain('PUBLIC_BRAND');
    expect(src).toContain('method="post"');
    expect(src).toContain('MATCH_ALERT_START_API_PATH');
    expect(src).toContain('Start this claim');
    expect(src).toMatch(/One tap/);
    expect(src).toContain('autoFocus');
    expect(src).not.toContain('verifyOtp');
    expect(src).not.toMatch(/onLoad|autoSubmit|useEffect/);
  });
});

describe('/api/match-alert/start', () => {
  it('GET does not consume the token (scanner-safe)', async () => {
    const { token } = issued();
    const res = await GET(new Request(`https://claimmatch.test/api/match-alert/start?t=${token}`));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/match-alert/start?t=');
    expect(m.generateLink).not.toHaveBeenCalled();
    expect(m.verifyOtp).not.toHaveBeenCalled();
  });

  it('POST consumes a valid token and lands on the claim', async () => {
    const { token } = issued();
    const res = await POST(
      new Request('https://claimmatch.test/api/match-alert/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '203.0.113.14',
        },
        body: new URLSearchParams({ t: token }).toString(),
      }),
    );
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/claim/verified-open');
  });
});
