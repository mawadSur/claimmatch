import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimScreenResponse } from '@/lib/mobile-contract';
3
type Read = { client: string; table: string; select: string; filters: [string, unknown][] };
type Lookup = { ok: true; settlement: Record<string, unknown> | null } | { ok: false };
6
// The route runs the real claim-screen loader; only its reads are faked.
const h = vi.hoisted(() => {
  const state = {
    cookieUser: null as { id: string } | null,
    bearerUser: null as { id: string } | null,
    authDown: false,
    lookup: { ok: false } as Lookup,
    lookups: [] as string[],
    claimRow: null as Record<string, unknown> | null,
    claimError: null as { code: string; message: string } | null,
    profileRow: null as Record<string, unknown> | null,
    reads: [] as Read[],
    rateOk: true,
    rateCalls: [] as unknown[][],
    oneClick: null as {
      canStart: boolean;
      view: { claim?: { status: string } } | null;
      lane: { agent: boolean; lane: string; reasons?: string[] } | null;
      accountEmail: string | null;
    } | null,
    oneClickCalls: [] as Record<string, unknown>[],
  };
  const client = (name: string) => ({
    from: (table: string) => {
      const read: Read = { client: name, table, select: '', filters: [] };
      state.reads.push(read);
      const chain = {
        select: (columns: string) => {
          read.select = columns;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return chain;
        },
        maybeSingle: async () =>
          table === 'claims'
            ? { data: state.claimRow, error: state.claimError }
            : { data: state.profileRow, error: null },
      };
      return chain;
    },
  });
  return Object.assign(state, { client });
});
47
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.client('cookie'),
    auth: { getUser: async () => ({ data: { user: h.cookieUser } }) },
  }),
  createServiceClient: () => {
    throw new Error('the settlement is read through loadSettlementBySlug');
  },
}));
57
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    ...h.client('bearer'),
    auth: {
      getUser: async () => {
        if (h.bearerUser) return { data: { user: h.bearerUser }, error: null };
        return {
          data: { user: null },
          error: h.authDown
            ? { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }
            : { name: 'AuthApiError', message: 'invalid JWT', status: 403, code: 'bad_jwt' },
        };
      },
    },
  }),
}));
74
vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    loadSettlementBySlug: async (slug: string) => {
      h.lookups.push(slug);
      return h.lookup;
    },
    logClaimsError: () => undefined,
  };
});
86
vi.mock('@/components/filing/claim-page-data', () => ({
  loadOneClickClaimPage: async (args: Record<string, unknown>) => {
    h.oneClickCalls.push(args);
    return h.oneClick;
  },
}));
93
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (key: string, options: unknown) => {
    h.rateCalls.push([key, options]);
    return h.rateOk ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 30 };
  },
}));
100
import { GET } from '@/app/api/mobile/claim/[slug]/route';
import { PACKET_PROFILE_COLUMNS } from '@/lib/claim-screen';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';
105
const NOW = new Date('2026-10-16T18:00:00Z');
const SETTLEMENT_ID = '00000000-0000-4000-8000-0000000000d1';
const CLAIM_ID = '00000000-0000-4000-8000-0000000000c1';
const PROFILE = {
  full_name: 'Ada Lovelace',
  email: 'ada@lawsuitai.org',
  phone: '555-0100',
  address_line1: '1 Main St',
  address_line2: null,
  city: 'Springfield',
  state: 'CA',
  prefill_consent_at: '2026-10-01T00:00:00Z',
};
119
function settlement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SETTLEMENT_ID,
    slug: 'real-settlement',
    title: 'Real settlement',
    category: 'Data Breach',
    status: 'open',
    review_status: 'published',
    deadline: '2026-11-30',
    claim_url: 'https://www.real-admin.com/file',
    source_url: 'https://settlesignal.com/settlements/real-settlement',
    eligibility_text: 'People whose data was exposed in the 2025 breach.',
    eligibility: null,
    proof_required: false,
    form_field_order: null,
    ...overrides,
  };
}
function claimRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLAIM_ID,
    user_id: 'user-a',
    lawsuit_id: SETTLEMENT_ID,
    lawsuit_title: 'Real settlement',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}
153
function get(slug = 'real-settlement', authorization?: string) {
  const req = new Request(`http://localhost/api/mobile/claim/${slug}`, {
    headers: authorization ? { authorization } : {},
  });
  return GET(req, { params: Promise.resolve({ slug }) });
}
async function expectReply(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(res.headers.get('vary')).toBe('Authorization, Cookie');
  return (await res.json()) as Record<string, unknown>;
}
166
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.cookieUser = { id: 'user-a' };
  h.bearerUser = null;
  h.authDown = false;
  h.lookup = { ok: true, settlement: settlement() };
  h.lookups = [];
  h.claimRow = claimRow();
  h.claimError = null;
  h.profileRow = { ...PROFILE };
  h.reads = [];
  h.rateOk = true;
  h.rateCalls = [];
  h.oneClick = null;
  h.oneClickCalls = [];
});
184
afterEach(() => {
  vi.useRealTimers();
});
188
describe('GET /api/mobile/claim/[slug]: sign-in and limits', () => {
  it('returns 401 without a session, before reading anything', async () => {
    h.cookieUser = null;
    expect(await expectReply(await get(), 401)).toEqual({ error: 'Please log in again.' });
    expect(h.lookups).toEqual([]);
    expect(h.rateCalls).toEqual([]);
  });
196
  it('reads as the bearer user, and never falls back to the cookie for a malformed token', async () => {
    h.bearerUser = { id: 'user-b' };
    await expectReply(await get('real-settlement', 'Bearer app-header.app-payload.app-signature'), 200);
    // Every filter: without the lawsuit one, a user with two claims would get
    // a load error, and one with a single claim would see it on every settlement.
    expect(h.reads.map((r) => [r.client, r.table, r.filters])).toEqual([
      [
        'bearer',
        'claims',
        [
          ['user_id', 'user-b'],
          ['lawsuit_id', SETTLEMENT_ID],
        ],
      ],
      ['bearer', 'profiles', [['id', 'user-b']]],
    ]);
213
    h.lookups = [];
    await expectReply(await get('real-settlement', 'Bearer a.b'), 401);
    expect(h.lookups).toEqual([]);
  });
218
  it('answers 503, not 401, when Supabase Auth cannot check the token, before reading anything', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.authDown = true;
    const res = await get('real-settlement', 'Bearer app-header.app-payload.app-signature');
    errorLog.mockRestore();
    expect(await expectReply(res, 503)).toEqual(AUTH_UNAVAILABLE);
    expect(h.lookups).toEqual([]);
    expect(h.reads).toEqual([]);
    expect(h.rateCalls).toEqual([]);
  });
229
  it('is limited to 60 reads a minute per user, shared with the dashboard', async () => {
    await expectReply(await get(), 200);
    expect(h.rateCalls).toEqual([['mobile-read:user-a', { limit: 60, windowMs: 60_000 }]]);
233
    h.rateOk = false;
    h.lookups = [];
    const res = await get();
    await expectReply(res, 429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(h.lookups).toEqual([]);
  });
});
242
describe('GET /api/mobile/claim/[slug]: what it answers', () => {
  it('returns 404 for an unknown slug or a settlement without a real id', async () => {
    h.lookup = { ok: true, settlement: null };
    expect(await expectReply(await get('no-such-settlement'), 404)).toEqual({ code: 'not_found' });
    expect(h.lookups).toEqual(['no-such-settlement']);
248
    h.lookup = { ok: true, settlement: settlement({ id: 'sample-1' }) };
    expect(await expectReply(await get(), 404)).toEqual({ code: 'not_found' });
  });
252
  it('returns 404 for a fictional settlement without a claim, and the flow with one', async () => {
    const slug = FICTIONAL_SLUGS[0];
    h.lookup = { ok: true, settlement: settlement({ slug }) };
    h.claimRow = null;
    expect(await expectReply(await get(slug), 404)).toEqual({ code: 'not_found' });
258
    h.claimRow = claimRow();
    const body = (await expectReply(await get(slug), 200)) as ClaimScreenResponse;
    expect(body).toMatchObject({ kind: 'flow', slug, context: { fictional: true, openForClaims: false } });
  });
263
  it('answers closed for a settlement past its late-report window, with no claim', async () => {
    h.lookup = { ok: true, settlement: settlement({ deadline: '2026-08-01' }) };
    h.claimRow = null;
    expect(await expectReply(await get(), 200)).toEqual({
      kind: 'closed',
      slug: 'real-settlement',
      title: 'Real settlement',
      category: 'Data Breach',
      deadline: '2026-08-01',
      deadlinePassed: true,
      officialUrl: 'https://www.real-admin.com/file',
    });
  });
277
  it('answers the flow for a claim on a settlement that is no longer published', async () => {
    h.lookup = { ok: true, settlement: settlement({ review_status: 'pending_review' }) };
    h.claimRow = null;
    expect(await expectReply(await get(), 404)).toEqual({ code: 'not_found' });
282
    h.claimRow = claimRow();
    const body = await expectReply(await get(), 200);
    expect(Object.keys(body).sort()).toEqual([
      'category',
      'claim',
      'context',
      'kind',
      'now',
      'oneClick',
      'profile',
      'settlement',
      'slug',
      'title',
    ]);
    expect(body).toMatchObject({
      kind: 'flow',
      now: NOW.toISOString(),
      slug: 'real-settlement',
      title: 'Real settlement',
      category: 'Data Breach',
      context: { known: true, published: false, fictional: false, openForClaims: false },
      claim: { id: CLAIM_ID, status: 'self_file' },
      settlement: {
        id: SETTLEMENT_ID,
        slug: 'real-settlement',
        officialUrl: 'https://www.real-admin.com/file',
        sourceHost: 'settlesignal.com',
        assistedFilingAllowed: false,
        payoutReportEnabled: false,
      },
      profile: PROFILE,
    });
  });
316
  it('returns 503 when the settlement or the claim cannot be read', async () => {
    h.lookup = { ok: false };
    expect(await expectReply(await get(), 503)).toEqual({ code: 'load_error', what: 'this settlement' });
    expect(h.reads).toEqual([]);
321
    h.lookup = { ok: true, settlement: settlement() };
    h.claimError = { code: '57014', message: 'timeout' };
    expect(await expectReply(await get(), 503)).toEqual({ code: 'load_error', what: 'your claim' });
  });
326
  it('sends only the copy-ready profile fields, never the matching answers', async () => {
    h.profileRow = { ...PROFILE, attributes: { had_data_breach: true }, is_admin: true, referral_code: 'ref-1' };
    const body = await expectReply(await get(), 200);
    expect(body.profile).toEqual(PROFILE);
    expect(body.profile).not.toHaveProperty('attributes');
    expect(JSON.stringify(body)).not.toMatch(/attributes|had_data_breach|is_admin|referral/);
333
    const profileRead = h.reads.find((r) => r.table === 'profiles');
    expect(profileRead?.select).toBe(PACKET_PROFILE_COLUMNS);
    expect(profileRead?.select).not.toMatch(/attributes/);
  });
});
339
describe('GET /api/mobile/claim/[slug]: one-click filing', () => {
  it('sends oneClick null when the loader says one-click filing is off', async () => {
    const body = await expectReply(await get(), 200);
    expect(body.oneClick).toBeNull();
    expect(h.oneClickCalls).toHaveLength(1);
    expect(h.oneClickCalls[0]).toMatchObject({ userId: 'user-a', slug: 'real-settlement', lawsuitId: SETTLEMENT_ID });
  });
347
  it('sends only the start decision, never the filing view or the account email', async () => {
    h.oneClick = {
      canStart: true,
      view: { claim: { status: 'self_file' } },
      lane: { agent: true, lane: 'administrator_email', reasons: [] },
      accountEmail: 'ada@lawsuitai.org',
    };
    const body = await expectReply(await get(), 200);
    expect(body.oneClick).toEqual({ canStart: true });
    expect(JSON.stringify(body.oneClick)).not.toMatch(/packet|ada@/);
  });
354
  it('sends a per-claim legalDisclaimer on an agent lane when one-click is on', async () => {
    vi.stubEnv('ONE_CLICK_FILING_ENABLED', '1');
    h.oneClick = {
      canStart: true,
      view: { claim: { status: 'self_file' } },
      lane: { agent: true, lane: 'administrator_email', reasons: [] },
      accountEmail: 'ada@lawsuitai.org',
    };
    const body = await expectReply(await get(), 200);
    expect(body.legalDisclaimer).toMatch(/files this claim for you with the settlement administrator/);
  });

  it('asks the one-click gate with the bearer account’s own email (test mode allows INTERNAL_EMAILS testers only)', async () => {
    h.bearerUser = { id: 'user-b', email: 'tester@lawsuitai.example' } as { id: string };
    await expectReply(await get('real-settlement', 'Bearer app-header.app-payload.app-signature'), 200);
    expect(h.oneClickCalls[0]).toMatchObject({ userId: 'user-b', accountEmail: 'tester@lawsuitai.example' });
  });
360
  it('never asks for a closed settlement', async () => {
    h.lookup = { ok: true, settlement: settlement({ deadline: '2026-08-01' }) };
    h.claimRow = null;
    const body = await expectReply(await get(), 200);
    expect(body.kind).toBe('closed');
    expect(h.oneClickCalls).toEqual([]);
  });
});
369
