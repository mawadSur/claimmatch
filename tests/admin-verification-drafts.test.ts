import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  summary: { considered: 0, drafted: 0, failed: 0, skipped: 0, skippedReason: null as string | null },
  review: { ok: true as boolean, error: undefined as string | undefined, lawsuit: { id: 'l1' } as Record<string, unknown> | undefined },
  lastReview: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => h.admin,
}));

vi.mock('@/lib/verification-drafts-store', () => ({
  listPendingVerificationDrafts: async () => [],
  persistVerificationDrafts: async () => h.summary,
  reviewVerificationDraft: async (input: Record<string, unknown>) => {
    h.lastReview = input;
    return h.review;
  },
}));

import { GET, PATCH, POST } from '@/app/api/admin/verification-drafts/route';

beforeEach(() => {
  h.admin = null;
  h.lastReview = null;
  h.review = { ok: true, error: undefined, lawsuit: { id: 'l1' } };
  vi.unstubAllEnvs();
});

describe('GET /api/admin/verification-drafts', () => {
  it('rejects anyone who is not an admin', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns enabled false when the flag is off', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ drafts: [], enabled: false });
  });
});

describe('POST /api/admin/verification-drafts', () => {
  it('404s when the flag is off', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    const res = await POST(
      new Request('http://localhost/api/admin/verification-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/verification-drafts', () => {
  it('stamps verified fields from the admin session via reviewVerificationDraft', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    vi.stubEnv('VERIFY_ASSIST_ENABLED', '1');
    const res = await PATCH(
      new Request('http://localhost/api/admin/verification-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          action: 'accept',
          fields: { eligibility_verified: 'US residents.', proof_verified: 'no' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(h.lastReview).toMatchObject({
      adminId: 'admin-1',
      action: 'accept',
      fields: { eligibility_verified: 'US residents.', proof_verified: 'no' },
    });
  });

  it('does not let a client set verified_at', async () => {
    h.admin = { id: 'admin-1', email: 'ops@example.com' };
    vi.stubEnv('VERIFY_ASSIST_ENABLED', '1');
    await PATCH(
      new Request('http://localhost/api/admin/verification-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          action: 'accept',
          fields: { eligibility_verified: 'US residents.' },
          verified_at: '1999-01-01T00:00:00Z',
          verified_by: 'attacker',
        }),
      }),
    );
    expect(h.lastReview).toMatchObject({ adminId: 'admin-1' });
    expect(h.lastReview).not.toHaveProperty('verified_at');
    expect(h.lastReview).not.toHaveProperty('verified_by');
  });
});
