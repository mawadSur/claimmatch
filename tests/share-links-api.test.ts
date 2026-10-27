import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  inserted: null as Record<string, unknown> | null,
  insertError: null as { code?: string } | null,
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
            order: async () => ({ data: [], error: null }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: h.inserted, error: h.insertError }),
            }),
          }),
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

import { GET, POST } from '@/app/api/admin/share-links/route';

beforeEach(() => {
  h.admin = null;
  h.inserted = null;
  h.insertError = null;
});

describe('/api/admin/share-links', () => {
  it('rejects anyone who is not an admin', async () => {
    expect((await GET()).status).toBe(401);
    expect(
      (
        await POST(
          new Request('http://localhost/api/admin/share-links', {
            method: 'POST',
            body: JSON.stringify({ utm_source: 'twitter' }),
          }),
        )
      ).status,
    ).toBe(401);
  });

  it('creates a campaign link for an admin', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.inserted = {
      id: 'link-1',
      code: 'tw1',
      destination: '/',
      utm_source: 'twitter',
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      label: 'Twitter',
      created_at: '2026-10-26T00:00:00Z',
    };
    const res = await POST(
      new Request('http://localhost/api/admin/share-links', {
        method: 'POST',
        body: JSON.stringify({ utm_source: 'twitter', label: 'Twitter' }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { link: { code: string; clicks: number } };
    expect(json.link.code).toBe('tw1');
    expect(json.link.clicks).toBe(0);
  });

  it('requires at least one UTM field', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    const res = await POST(
      new Request('http://localhost/api/admin/share-links', {
        method: 'POST',
        body: JSON.stringify({ label: 'Empty' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
