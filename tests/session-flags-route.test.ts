import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock('@/lib/session-flags', () => ({
  applySessionFlags: vi.fn().mockResolvedValue({ internal: true, cohort: null }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }),
}));

import { POST } from '@/app/api/session-flags/route';

describe('POST /api/session-flags', () => {
  it('returns 204 with no body for signed-out visitors (no console noise)', async () => {
    m.user = null;
    const res = await POST();
    expect(res.status).toBe(204);
  });

  it('returns the flags for a signed-in user', async () => {
    m.user = { id: 'u1', email: 'a@b.test' };
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, internal: true });
  });
});
