import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  items: [] as { claim: Record<string, unknown>; settlement: Record<string, unknown> | null }[],
  failed: false,
  applied: [] as { claimId: string; plan: { changes: Record<string, unknown> } }[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
  createServiceClient: () => {
    throw new Error('routes must use the claims-server helpers');
  },
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));
vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    serviceRoleConfigured: () => true,
    loadUserClaims: async () => ({ items: h.items, failed: h.failed }),
    applyClaimPlan: async (args: { claimId: string; plan: { changes: Record<string, unknown> } }) => {
      h.applied.push(args);
      return { ok: true, claim: { id: args.claimId, status: 'withdrawn' }, created: false };
    },
  };
});

import { POST } from '@/app/api/claims/acknowledge-fictional/route';

const settlement = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  title: slug,
  status: 'closed',
  review_status: 'rejected',
  deadline: null,
});
const claim = (id: string, status = 'submitted', extra: Record<string, unknown> = {}) => ({
  id,
  lawsuit_id: `l-${id}`,
  lawsuit_title: id,
  status,
  confirmation_number: null,
  reported_filed_at: null,
  user_filed_on: null,
  corrective_notice_answered_at: null,
  corrective_notice_required: true,
  created_at: null,
  ...extra,
});
const post = (contentType = 'application/json') =>
  POST(new Request('http://localhost/api/claims/acknowledge-fictional', { method: 'POST', headers: { 'content-type': contentType }, body: '{}' }));

beforeEach(() => {
  h.user = { id: 'user-a' };
  h.failed = false;
  h.applied = [];
  h.items = [
    // Two fictional settlements (src/lib/fictional-slugs.ts) and one real one.
    { claim: claim('c1'), settlement: settlement('robocall-tcpa-settlement') },
    { claim: claim('c2'), settlement: settlement('mortgage-late-fee-settlement') },
    { claim: claim('c3'), settlement: { ...settlement('real-settlement'), status: 'open', review_status: 'published' } },
    // Already closed out: nothing to do.
    {
      claim: claim('c4', 'withdrawn', { corrective_notice_answered_at: '2026-10-01T00:00:00Z' }),
      settlement: settlement('sunscreen-benzene-recall-settlement'),
    },
  ];
});

describe('POST /api/claims/acknowledge-fictional', () => {
  it('closes out every claim on a fictional settlement in one request, and never touches real ones', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ acknowledged: 2 });
    expect(h.applied.map((a) => a.claimId)).toEqual(['c1', 'c2']);
    expect(h.applied[0].plan.changes).toMatchObject({ status: 'withdrawn' });
  });

  it('needs a signed-in user and a JSON request, and fails closed when claims cannot be read', async () => {
    h.user = null;
    expect((await post()).status).toBe(401);
    h.user = { id: 'user-a' };
    expect((await post('text/plain')).status).toBe(415);
    h.failed = true;
    expect((await post()).status).toBe(503);
    expect(h.applied).toHaveLength(0);
  });
});
