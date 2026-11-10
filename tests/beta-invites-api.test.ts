import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  inserted: null as Record<string, unknown> | null,
  insertError: null as { code?: string } | null,
  insertPayload: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => h.admin,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'share_links') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            h.insertPayload = row;
            return {
              select: () => ({
                single: async () => ({ data: h.inserted, error: h.insertError }),
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          in: async () => ({ data: [] }),
        }),
      };
    },
  }),
}));

import { GET, POST } from '@/app/api/admin/beta-invites/route';

beforeEach(() => {
  h.admin = null;
  h.inserted = null;
  h.insertError = null;
  h.insertPayload = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/admin/beta-invites', () => {
  it('404s when the flag is off', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    expect((await GET()).status).toBe(404);
    expect(
      (
        await POST(
          new Request('http://localhost/api/admin/beta-invites', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Ada' }),
          }),
        )
      ).status,
    ).toBe(404);
  });

  it('rejects anyone who is not an admin', async () => {
    vi.stubEnv('BETA_INVITE_CODES_ENABLED', '1');
    expect((await GET()).status).toBe(401);
  });

  it('creates a named beta share_links row with the beta UTM pair', async () => {
    vi.stubEnv('BETA_INVITE_CODES_ENABLED', '1');
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.inserted = {
      id: 'link-1',
      code: 'ada1',
      destination: '/signup',
      label: 'Ada',
      created_at: '2026-11-09T00:00:00Z',
    };
    const res = await POST(
      new Request('http://localhost/api/admin/beta-invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Ada', code: 'ada1' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(h.insertPayload).toMatchObject({
      code: 'ada1',
      utm_source: 'beta',
      utm_medium: 'invite',
      utm_campaign: 'soft-beta',
      label: 'Ada',
      created_by: 'admin-1',
    });
    const json = (await res.json()) as { invite: { code: string; visits: number } };
    expect(json.invite.code).toBe('ada1');
    expect(json.invite.visits).toBe(0);
  });
});
