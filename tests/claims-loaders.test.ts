import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The service-role reads behind the dashboard and the claim routes.
const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  calls: [] as { table: string; select?: string; filters: [string, unknown][] }[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('loaders read with the service role');
  },
  createServiceClient: () => ({
    from: (table: string) => {
      const call: (typeof h.calls)[number] = { table, filters: [] };
      h.calls.push(call);
      const chain = {
        select: (cols: string) => {
          call.select = cols;
          return chain;
        },
        eq: (col: string, value: unknown) => {
          call.filters.push([col, value]);
          return chain;
        },
        order: async () => h.result,
        maybeSingle: async () => h.result,
      };
      return chain;
    },
  }),
}));

import { addCalendarDays } from '@/lib/claim-deadlines';
import { claimContext, loadSettlementById, loadSettlementBySlug, loadUserClaims } from '@/lib/claims-server';
import { getSettlementGuide } from '@/lib/settlement-guides';

const SETTLEMENT = { id: '00000000-0000-4000-8000-0000000000d1', slug: 'real', title: 'Real', status: 'open', review_status: 'published', deadline: null };
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.calls = [];
  h.result = { data: null, error: null };
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe('settlement lookups fail closed', () => {
  it('tells "not found" apart from "could not read"', async () => {
    h.result = { data: SETTLEMENT, error: null };
    expect(await loadSettlementBySlug('real')).toEqual({ ok: true, settlement: SETTLEMENT });
    h.result = { data: null, error: null };
    expect(await loadSettlementById(SETTLEMENT.id)).toEqual({ ok: true, settlement: null });
    h.result = { data: null, error: { code: '57014', message: 'timeout' } };
    expect(await loadSettlementBySlug('real')).toEqual({ ok: false });
    expect(await loadSettlementById(SETTLEMENT.id)).toEqual({ ok: false });
  });

  it('never reads with the anon key (RLS would hide every fictional row)', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await loadSettlementBySlug('robocall-tcpa-settlement')).toEqual({ ok: false });
    expect(await loadSettlementById(SETTLEMENT.id)).toEqual({ ok: false });
    expect(await loadUserClaims('user-a')).toEqual({ items: [], failed: true });
    expect(h.calls).toHaveLength(0);
  });
});

describe('loadUserClaims', () => {
  it('reads claims and their settlements in one query for this user only', async () => {
    h.result = {
      data: [{ id: 'c1', lawsuit_id: SETTLEMENT.id, status: 'submitted', settlement: SETTLEMENT }],
      error: null,
    };
    const { items, failed } = await loadUserClaims('user-a');
    expect(failed).toBe(false);
    expect(items[0]).toMatchObject({ claim: { id: 'c1', status: 'submitted' }, settlement: SETTLEMENT });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].table).toBe('claims');
    expect(h.calls[0].select).toMatch(/settlement:lawsuits\(/);
    expect(h.calls[0].filters).toEqual([['user_id', 'user-a']]);
  });

  it('shows the error state when the read fails or a settlement is missing', async () => {
    h.result = { data: null, error: { code: '57014', message: 'timeout' } };
    expect(await loadUserClaims('user-a')).toEqual({ items: [], failed: true });
    h.result = { data: [{ id: 'c1', lawsuit_id: SETTLEMENT.id, status: 'submitted', settlement: null }], error: null };
    expect(await loadUserClaims('user-a')).toEqual({ items: [], failed: true });
  });
});

describe('official-notice guides on every settlement read', () => {
  const SLUG = 'kroger-prescription-drug-prices-class-action-settlement';
  const guide = getSettlementGuide(SLUG);
  if (!guide) throw new Error('expected a guide');
  // The feed's row: its deadline is later than the official one, and its link and proof differ.
  const FEED = {
    ...SETTLEMENT,
    slug: SLUG,
    title: 'Kroger',
    category: 'Health',
    deadline: addCalendarDays(guide.deadline, 40),
    claim_url: 'https://feed.example/kroger',
    source_url: null,
    eligibility_text: null,
    eligibility: { proof: 'no' },
    proof_required: false,
  };
  const OFFICIAL = {
    ...FEED,
    deadline: guide.deadline,
    claim_url: guide.officialUrl,
    eligibility_text: guide.eligibilityText,
    eligibility: { proof: guide.proof },
    proof_required: guide.proof === 'yes',
  };

  it('the claim screen and claim writes read the official deadline, link and proof rule', async () => {
    h.result = { data: FEED, error: null };
    expect(await loadSettlementBySlug(SLUG)).toEqual({ ok: true, settlement: OFFICIAL });
    expect(await loadSettlementById(FEED.id)).toEqual({ ok: true, settlement: OFFICIAL });
  });

  it('Your claims (and the app’s reminders) read them too', async () => {
    h.result = { data: [{ id: 'c1', lawsuit_id: FEED.id, status: 'self_file', settlement: FEED }], error: null };
    const { items, failed } = await loadUserClaims('user-a');
    expect(failed).toBe(false);
    expect(items[0].settlement).toEqual(OFFICIAL);
  });

  it('keep the feed’s link to the claim form when it is on the official site', async () => {
    // "Open the official claim form" goes to the form, not the official homepage.
    const FORM = 'https://www.krogersavingsclubsettlement.com/submit-claim';
    expect(guide.officialUrl).toBe('https://www.krogersavingsclubsettlement.com/');
    h.result = { data: { ...FEED, claim_url: FORM }, error: null };
    expect(await loadSettlementBySlug(SLUG)).toEqual({ ok: true, settlement: { ...OFFICIAL, claim_url: FORM } });
    expect(await loadSettlementById(FEED.id)).toEqual({ ok: true, settlement: { ...OFFICIAL, claim_url: FORM } });
    h.result = { data: [{ id: 'c1', lawsuit_id: FEED.id, status: 'self_file', settlement: { ...FEED, claim_url: FORM } }], error: null };
    expect((await loadUserClaims('user-a')).items[0].settlement).toEqual({ ...OFFICIAL, claim_url: FORM });
  });

  it('claimContext decides by the official deadline, also on a row a route read itself', () => {
    const dayAfter = new Date(`${addCalendarDays(guide.deadline, 1)}T17:00:00Z`);
    expect(claimContext(FEED, dayAfter)).toMatchObject({
      deadline: guide.deadline,
      deadlinePassed: true,
      openForClaims: false,
      lateReportOpen: true,
    });
    const lastDay = new Date(`${guide.deadline}T17:00:00Z`);
    expect(claimContext(FEED, lastDay)).toMatchObject({ deadlinePassed: false, openForClaims: true });
    // 31 days after the official deadline nothing can be reported, though the feed's is still ahead.
    const late = new Date(`${addCalendarDays(guide.deadline, 31)}T17:00:00Z`);
    expect(claimContext(FEED, late)).toMatchObject({ deadlinePassed: true, lateReportOpen: false });
    expect(claimContext({ ...FEED, slug: 'real' }, dayAfter)).toMatchObject({ deadline: FEED.deadline, openForClaims: true });
  });
});

describe('createServiceClient in production', () => {
  it('refuses to fall back to the anon key for a real project', async () => {
    const real = await vi.importActual<typeof import('@/lib/supabase/server')>('@/lib/supabase/server');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => real.createServiceClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY is not set');
    // No project configured at all (a build without secrets): the placeholder client, as before.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => real.createServiceClient()).not.toThrow();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    expect(() => real.createServiceClient()).not.toThrow();
  });
});
