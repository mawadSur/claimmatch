import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  shareLink: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  inserts: [] as Record<string, unknown>[],
  configured: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => db.configured,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'share_link_clicks') {
        return {
          insert: async (row: Record<string, unknown>) => {
            db.inserts.push(row);
            return { error: null };
          },
        };
      }
      const q = {
        _eq: '',
        select: () => q,
        eq: (_col: string, value: string) => {
          q._eq = value;
          return q;
        },
        maybeSingle: async () => {
          if (table === 'share_links') {
            return { data: db.shareLink && db.shareLink.code === q._eq ? db.shareLink : null };
          }
          if (table === 'profiles') {
            return { data: db.profile && db.profile.referral_code === q._eq ? db.profile : null };
          }
          return { data: null };
        },
      };
      return q;
    },
  }),
}));

import { GET } from '@/app/r/[code]/route';

const ORIGIN = 'https://claimmatch.vercel.app';

function hit(path: string) {
  return GET(new Request(`${ORIGIN}${path}`), {
    params: Promise.resolve({ code: path.split('/')[2]?.split('?')[0] ?? '' }),
  });
}

beforeEach(() => {
  db.shareLink = null;
  db.profile = null;
  db.inserts = [];
  db.configured = true;
});

describe('GET /r/[code]', () => {
  it('redirects a campaign short link with UTMs and ref, and logs the click', async () => {
    db.shareLink = {
      code: 'tw1',
      destination: '/',
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: 'launch',
      utm_content: null,
    };
    const res = await hit('/r/tw1');
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe(
      `${ORIGIN}/?utm_source=twitter&utm_medium=social&utm_campaign=launch&ref=tw1`,
    );
    expect(res.headers.get('set-cookie')).toMatch(/cm_ref=tw1/);
    expect(res.headers.get('set-cookie')).toMatch(/cm_attr=/);
    expect(db.inserts).toEqual([{ code: 'tw1' }]);
  });

  it('sends a personal referral to /signup with UTMs kept', async () => {
    db.profile = { id: 'user-1', referral_code: 'abc123def0' };
    const res = await hit('/r/abc123def0?utm_source=newsletter&utm_medium=email');
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith(`${ORIGIN}/signup?`)).toBe(true);
    expect(location).toContain('utm_source=newsletter');
    expect(location).toContain('utm_medium=email');
    expect(location).toContain('utm_campaign=personal');
    expect(location).toContain('ref=abc123def0');
    expect(db.inserts).toEqual([{ code: 'abc123def0' }]);
  });

  it('still lands on /signup with ref when the database is down', async () => {
    db.configured = false;
    const res = await hit('/r/orphan1?utm_source=ads');
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/signup?');
    expect(location).toContain('utm_source=ads');
    expect(location).toContain('ref=orphan1');
    expect(db.inserts).toEqual([]);
  });
});
