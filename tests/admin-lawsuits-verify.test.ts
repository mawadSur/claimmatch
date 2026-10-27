import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  updated: null as Record<string, unknown> | null,
  lastUpdate: null as Record<string, unknown> | null,
  updateError: null as { message?: string } | null,
}));

vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => h.admin,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: (updates: Record<string, unknown>) => {
        h.lastUpdate = updates;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: h.updated, error: h.updateError }),
            }),
          }),
        };
      },
    }),
  }),
}));

import { PATCH } from '@/app/api/admin/lawsuits/route';

function patch(body: unknown) {
  return PATCH(
    new Request('http://localhost/api/admin/lawsuits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  h.admin = null;
  h.updated = null;
  h.lastUpdate = null;
  h.updateError = null;
});

describe('PATCH /api/admin/lawsuits verify', () => {
  const id = '00000000-0000-4000-8000-000000000001';

  it('rejects anyone who is not an admin', async () => {
    const res = await patch({
      id,
      action: 'verify',
      patch: { eligibility_verified: 'US residents.' },
    });
    expect(res.status).toBe(401);
    expect(h.lastUpdate).toBeNull();
  });

  it('stamps verified_at and verified_by only from the admin session', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.updated = {
      id,
      verified_at: '2026-10-27T00:00:00Z',
      verified_by: 'admin-1',
      eligibility_verified: 'US residents who bought the product.',
      proof_verified: 'no',
    };
    const res = await patch({
      id,
      action: 'verify',
      patch: {
        eligibility_verified: 'US residents who bought the product.',
        proof_verified: 'no',
        administrator: 'Example Admin Co',
        verified_at: '1999-01-01T00:00:00Z',
        verified_by: 'attacker',
      },
    });
    expect(res.status).toBe(200);
    expect(h.lastUpdate).toMatchObject({
      eligibility_verified: 'US residents who bought the product.',
      proof_verified: 'no',
      administrator: 'Example Admin Co',
      verified_by: 'admin-1',
    });
    expect(h.lastUpdate?.verified_at).toEqual(expect.any(String));
    expect(h.lastUpdate?.verified_at).not.toBe('1999-01-01T00:00:00Z');
    expect(h.lastUpdate?.verified_by).not.toBe('attacker');
  });

  it('does not let an update patch set verified_at or verified_by', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.updated = { id, title: 'Saved' };
    const res = await patch({
      id,
      action: 'update',
      patch: {
        title: 'Saved',
        verified_at: '2026-01-01T00:00:00Z',
        verified_by: 'admin-1',
      },
    });
    expect(res.status).toBe(200);
    expect(h.lastUpdate).toEqual({ title: 'Saved' });
    expect(h.lastUpdate).not.toHaveProperty('verified_at');
    expect(h.lastUpdate).not.toHaveProperty('verified_by');
  });

  it('rejects an invalid proof_verified value', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    const res = await patch({
      id,
      action: 'verify',
      patch: { proof_verified: 'maybe' },
    });
    expect(res.status).toBe(400);
    expect(h.lastUpdate).toBeNull();
  });

  it('clears the stamp on unverify without touching verified fields', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    h.updated = { id, verified_at: null, verified_by: null };
    const res = await patch({ id, action: 'unverify' });
    expect(res.status).toBe(200);
    expect(h.lastUpdate).toEqual({ verified_at: null, verified_by: null });
  });
});
