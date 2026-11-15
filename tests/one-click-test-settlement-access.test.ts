import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The one-click TEST settlement (src/lib/test-settlements.ts) is for
// INTERNAL_EMAILS testers only, in every mode: no public list carries it, and
// nobody else can start tracking it (POST /api/claims) or start one-click on
// it (startFiling), also once ONE_CLICK_FILING_ENABLED is on.

const h = vi.hoisted(() => ({
  user: { id: 'user-a', email: 'member@example.com' } as { id: string; email: string } | null,
  settlement: null as Record<string, unknown> | null,
  started: [] as Record<string, unknown>[],
  envs: new Map<string, unknown>(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  }),
  createServiceClient: () => {
    throw new Error('no service writes expected');
  },
}));

vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));

vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    serviceRoleConfigured: () => true,
    loadSettlementById: async () => ({ ok: true, settlement: h.settlement }),
    logClaimsError: () => undefined,
    startTrackingClaim: async (args: Record<string, unknown>) => {
      h.started.push(args);
      return { ok: true, claim: { id: 'claim-new', status: 'self_file' }, created: true };
    },
  };
});

vi.mock('@/lib/filing/v2/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/filing/v2/environment')>();
  return { ...actual, loadSettlementEnvs: async () => ({ ok: true, envs: h.envs, lane: {} }) };
});

import { POST } from '@/app/api/claims/route';
import { startFiling } from '@/lib/filing/v2/start';
import type { FilingCaller } from '@/lib/filing/v2/http';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import { LIST_HIDDEN_SLUGS, ONE_CLICK_TEST_SLUG, isTestSettlementSlug } from '@/lib/test-settlements';

const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000d1';
const TESTER = 'qa@lawsuit.test';

function settlement(slug: string): Record<string, unknown> {
  return {
    id: LAWSUIT_ID,
    slug,
    title: 'Settlement',
    status: 'open',
    review_status: 'published',
    deadline: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10),
    claim_url: null,
  };
}

function post() {
  return POST(
    new Request('http://localhost/api/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lawsuit_id: LAWSUIT_ID }),
    }),
  );
}

/** A caller whose existing-claim and profile reads find nothing. */
function caller(email: string): FilingCaller {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { from: () => chain }, user: { id: 'user-a', email }, via: 'cookie' } as unknown as FilingCaller;
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_EMAILS', TESTER);
  vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
  h.user = { id: 'user-a', email: 'member@example.com' };
  h.started = [];
  h.envs = new Map([[LAWSUIT_ID, { settlement: { id: LAWSUIT_ID, slug: ONE_CLICK_TEST_SLUG }, context: { published: true, fictional: false } }]]);
});
afterEach(() => vi.unstubAllEnvs());

describe('the test settlement slug', () => {
  it('is recognised in any case and left out of every public list with the fictional slugs', () => {
    expect(isTestSettlementSlug(ONE_CLICK_TEST_SLUG.toUpperCase())).toBe(true);
    expect(isTestSettlementSlug('real-settlement')).toBe(false);
    expect(isTestSettlementSlug(null)).toBe(false);
    expect(LIST_HIDDEN_SLUGS).toContain(ONE_CLICK_TEST_SLUG);
    for (const slug of FICTIONAL_SLUGS) expect(LIST_HIDDEN_SLUGS).toContain(slug);
  });
});

describe('POST /api/claims on the test settlement', () => {
  it('is a 404 for a member outside INTERNAL_EMAILS, and tracks nothing', async () => {
    h.settlement = settlement(ONE_CLICK_TEST_SLUG);
    expect((await post()).status).toBe(404);
    expect(h.started).toHaveLength(0);
  });

  it('works for an internal tester, and real settlements are unchanged for everyone', async () => {
    h.settlement = settlement(ONE_CLICK_TEST_SLUG);
    h.user = { id: 'user-a', email: TESTER.toUpperCase() };
    expect((await post()).status).toBe(201);
    h.user = { id: 'user-a', email: 'member@example.com' };
    h.settlement = settlement('real-settlement');
    expect((await post()).status).toBe(201);
    expect(h.started).toHaveLength(2);
  });
});

describe('startFiling on the test settlement', () => {
  const req = new Request('http://localhost/api/filing/claims', { method: 'POST' });

  it('is not_found for a member outside INTERNAL_EMAILS, also with one-click live', async () => {
    expect(await startFiling(caller('member@example.com'), LAWSUIT_ID, req)).toEqual({ ok: false, code: 'not_found' });
  });

  it('lets an internal tester past the test-settlement check', async () => {
    // Past the check the settlement is closed here (no spec, no deadline), which proves the check let it through.
    const out = await startFiling(caller(TESTER), LAWSUIT_ID, req);
    expect(out).not.toEqual({ ok: false, code: 'not_found' });
  });
});
