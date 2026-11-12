import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  link: null as { code: string; utm_source: string; utm_medium: string } | null,
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'share_links') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: h.link, error: null }),
            }),
          }),
        };
      }
      if (table === 'share_link_clicks') {
        return {
          insert: (row: Record<string, unknown>) => {
            h.inserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  }),
}));

import { POST } from '@/app/api/beta-invite/visit/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/beta-invite/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  h.link = null;
  h.inserted = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/beta-invite/visit', () => {
  it('404s when the flag is off and never writes', async () => {
    h.link = { code: 'ada1', utm_source: 'beta', utm_medium: 'invite' };
    expect((await post({ code: 'ada1' })).status).toBe(404);
    expect(h.inserted).toEqual([]);
  });

  it('logs a click only for a beta invite code', async () => {
    vi.stubEnv('BETA_INVITE_CODES_ENABLED', '1');
    h.link = { code: 'ada1', utm_source: 'beta', utm_medium: 'invite' };
    const res = await post({ code: 'ada1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(h.inserted).toEqual([{ code: 'ada1' }]);
  });

  it('does not log a regular campaign code', async () => {
    vi.stubEnv('BETA_INVITE_CODES_ENABLED', '1');
    h.link = { code: 'tw1', utm_source: 'twitter', utm_medium: 'social' };
    const res = await post({ code: 'tw1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(h.inserted).toEqual([]);
  });
});
