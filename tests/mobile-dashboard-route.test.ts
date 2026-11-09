import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimView } from '@/lib/claims';
import type { ClaimWithSettlement, SettlementRecord } from '@/lib/claims-server';
import type { DashboardResponse } from '@/lib/mobile-contract';

type Read = { client: string; table: string; select: string; filters: [string, unknown][] };

// The route runs the real dashboard loader; only its reads are faked.
const h = vi.hoisted(() => {
  const state = {
    cookieUser: null as { id: string } | null,
    bearerUser: null as { id: string } | null,
    authDown: false,
    profile: null as Record<string, unknown> | null,
    reads: [] as Read[],
    claims: { items: [] as ClaimWithSettlement[], failed: false },
    claimReads: [] as string[],
    catalog: { lawsuits: [] as unknown[], error: false } as { lawsuits: unknown[]; error: boolean } | 'throws',
    rateOk: true,
    rateCalls: [] as unknown[][],
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
        maybeSingle: async () => ({ data: state.profile, error: null }),
      };
      return chain;
    },
  });
  return Object.assign(state, { client });
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.client('cookie'),
    auth: { getUser: async () => ({ data: { user: h.cookieUser } }) },
  }),
  createServiceClient: () => {
    throw new Error('claims are read through loadUserClaims');
  },
  createPublicClient: () => {
    throw new Error('the catalog is read through lookupLawsuits');
  },
}));

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

vi.mock('@/lib/claims-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claims-server')>();
  return {
    ...actual,
    loadUserClaims: async (userId: string) => {
      h.claimReads.push(userId);
      return h.claims;
    },
  };
});

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupLawsuits: async () => {
      if (h.catalog === 'throws') throw new Error('network down');
      return h.catalog;
    },
  };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (key: string, options: unknown) => {
    h.rateCalls.push([key, options]);
    return h.rateOk ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: 30 };
  },
}));

// For the web /dashboard page, which renders from the same loader.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/dashboard',
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import { renderToStaticMarkup } from 'react-dom/server';
import { GET } from '@/app/api/mobile/dashboard/route';
import DashboardPage from '@/app/dashboard/page';
import { buildDashboard } from '@/components/claims/dashboard-model';
import { isFictionalSettlementSlug } from '@/lib/claims-server';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import { AUTH_UNAVAILABLE } from '@/lib/supabase/request-user';
import { makeLawsuit } from './helpers';

const NOW = new Date('2026-10-16T18:00:00Z');
const BEARER = 'Bearer app-header.app-payload.app-signature';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function settlement(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    id: uuid(),
    slug: 'real-one',
    title: 'Real settlement',
    category: 'Data Breach',
    status: 'open',
    review_status: 'published',
    deadline: '2026-11-30',
    claim_url: 'https://www.real-admin.com/file',
    source_url: null,
    eligibility_text: null,
    eligibility: null,
    proof_required: null,
    ...overrides,
  };
}
function tracked(s: SettlementRecord, overrides: Partial<ClaimView> = {}): ClaimWithSettlement {
  const claim: ClaimView = {
    id: uuid(),
    lawsuit_id: s.id,
    lawsuit_title: s.title,
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: null,
    ...overrides,
  };
  return { claim, settlement: s };
}

function get(authorization?: string) {
  return GET(
    new Request('http://localhost/api/mobile/dashboard', {
      headers: authorization ? { authorization } : {},
    }),
  );
}
async function body(authorization?: string): Promise<DashboardResponse> {
  const res = await get(authorization);
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardResponse;
}
function expectNoStore(res: Response) {
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(res.headers.get('vary')).toBe('Authorization, Cookie');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.cookieUser = { id: 'user-a' };
  h.bearerUser = null;
  h.authDown = false;
  h.profile = { full_name: 'Ada  Lovelace', onboarded: true, state: 'CA', attributes: { had_data_breach: true } };
  h.reads = [];
  h.claims = { items: [tracked(settlement({ slug: 'tracked-one', title: 'Tracked one' }))], failed: false };
  h.claimReads = [];
  h.catalog = {
    lawsuits: [
      makeLawsuit(
        { states: ['CA'], requires: ['had_data_breach'] },
        { id: uuid(), slug: 'breach', title: 'Breach', deadline: '2026-12-01', claim_url: 'https://www.breach-admin.com/file' },
      ),
      makeLawsuit({ states: ['CA'] }, { id: uuid(), slug: 'state-only', title: 'State only', deadline: '2026-11-01' }),
    ],
    error: false,
  };
  h.rateOk = true;
  h.rateCalls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/mobile/dashboard: sign-in and limits', () => {
  it('returns 401 without a session, before reading anything', async () => {
    h.cookieUser = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Please log in again.' });
    expectNoStore(res);
    expect(h.claimReads).toEqual([]);
    expect(h.rateCalls).toEqual([]);
  });

  it('reads as the bearer user, and never falls back to the cookie for a malformed token', async () => {
    h.bearerUser = { id: 'user-b' };
    await body(BEARER);
    expect(h.claimReads).toEqual(['user-b']);
    expect(h.reads.find((r) => r.table === 'profiles')).toMatchObject({ client: 'bearer', filters: [['id', 'user-b']] });

    h.claimReads = [];
    const res = await get('Bearer not-a-token');
    expect(res.status).toBe(401);
    expectNoStore(res);
    expect(h.claimReads).toEqual([]);
  });

  it('answers 503, not 401, when Supabase Auth cannot check the token, before reading anything', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.authDown = true;
    const res = await get(BEARER);
    errorLog.mockRestore();
    expect(res.status).toBe(503);
    expectNoStore(res);
    expect(await res.json()).toEqual(AUTH_UNAVAILABLE);
    expect(h.claimReads).toEqual([]);
    expect(h.reads).toEqual([]);
    expect(h.rateCalls).toEqual([]);
  });

  it('is limited to 60 reads a minute per user', async () => {
    await body();
    expect(h.rateCalls).toEqual([['mobile-read:user-a', { limit: 60, windowMs: 60_000 }]]);

    h.rateOk = false;
    h.claimReads = [];
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expectNoStore(res);
    expect(h.claimReads).toEqual([]);
  });
});

describe('GET /api/mobile/dashboard: the response', () => {
  it('sends what the web dashboard shows, without scores or profile answers', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expectNoStore(res);
    const data = (await res.json()) as DashboardResponse;

    expect(Object.keys(data).sort()).toEqual(['claims', 'closingSoon', 'matches', 'profile', 'reminders', 'serverTime']);
    expect(data.serverTime).toBe(NOW.toISOString());
    expect(data.profile).toEqual({ firstName: 'Ada', onboarded: true, needsProfile: false });
    expect(data.claims).toEqual({ failed: false, ...buildDashboard(h.claims.items, NOW, isFictionalSettlementSlug) });

    expect(data.matches).toMatchObject({ failed: false, possibleHidden: 0 });
    expect(data.matches.strong.map((m) => m.slug)).toEqual(['breach']);
    expect(data.matches.possible.map((m) => m.slug)).toEqual(['state-only']);
    expect(data.matches.strong[0]).toMatchObject({ label: 'Strong match', strength: 'strong' });
    for (const match of [...data.matches.strong, ...data.matches.possible]) {
      expect(Object.keys(match).sort()).toEqual([
        'deadlineText',
        'id',
        'label',
        'officialUrl',
        'reasons',
        'slug',
        'strength',
        'title',
      ]);
    }
    expect(data.closingSoon).toMatchObject({ failed: false });
    expect(data.closingSoon.items.map((i) => i.slug)).toEqual(['state-only', 'breach']);

    const json = JSON.stringify(data);
    expect(json).not.toMatch(/"score"/);
    expect(json).not.toMatch(/attributes|had_data_breach|Lovelace/);
  });

  it.each([
    [
      'a profile with no name, state or answers, not onboarded',
      { full_name: null, onboarded: false, state: null, attributes: {} },
      { firstName: '', onboarded: false, needsProfile: true },
    ],
    ['no profile row', null, { firstName: '', onboarded: false, needsProfile: true }],
    [
      'onboarded with nothing to match on',
      { full_name: 'Grace', onboarded: true, state: null, attributes: {} },
      { firstName: 'Grace', onboarded: true, needsProfile: true },
    ],
  ])('reports the profile state for %s', async (_label, profile, expected) => {
    h.profile = profile;
    expect((await body()).profile).toEqual(expected);
  });

  it('flags the claims section when the claims cannot be read', async () => {
    h.claims = { items: [], failed: true };
    const data = await body();
    expect(data.claims).toEqual({ failed: true, rows: [], notices: [] });
    expect(data.reminders).toEqual([]);
    expect(data.matches.failed).toBe(false);
    expect(data.closingSoon.failed).toBe(false);
  });

  it('flags matches and closing soon when the catalog cannot be read', async () => {
    const failures: (typeof h.catalog)[] = [{ lawsuits: [], error: true }, 'throws'];
    for (const catalog of failures) {
      h.catalog = catalog;
      const data = await body();
      expect(data.matches).toEqual({ failed: true, strong: [], possible: [], possibleHidden: 0 });
      expect(data.closingSoon).toEqual({ failed: true, items: [] });
      expect(data.claims.failed).toBe(false);
    }
  });

  it('lists reminders only for claims still to file before a deadline that has not passed', async () => {
    const toFile = tracked(settlement({ slug: 'to-file', title: 'To file', deadline: '2026-11-30' }));
    const legacy = tracked(settlement({ slug: 'legacy', title: 'Legacy', deadline: '2026-12-15' }), {
      status: 'processing',
    });
    h.claims = {
      items: [
        toFile,
        legacy,
        tracked(settlement({ slug: 'passed', deadline: '2026-10-01' })),
        tracked(settlement({ slug: 'no-deadline', deadline: null })),
        tracked(settlement({ slug: 'reported' }), { status: 'reported_filed' }),
        tracked(settlement({ slug: 'submitted' }), { status: 'submitted', confirmation_number: 'ABC-123' }),
        tracked(settlement({ slug: 'withdrawn' }), { status: 'withdrawn' }),
        tracked(settlement({ slug: FICTIONAL_SLUGS[0] })),
      ],
      failed: false,
    };
    expect((await body()).reminders).toEqual([
      { claimId: toFile.claim.id, slug: 'to-file', title: 'To file', deadline: '2026-11-30' },
      { claimId: legacy.claim.id, slug: 'legacy', title: 'Legacy', deadline: '2026-12-15' },
    ]);
  });
});

describe('the web /dashboard page, rendered from the same loader', () => {
  const render = async () => renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
  // The page's own onboarding card (the matches' empty state has a "Finish your profile" link too).
  const ONBOARDING_CARD = 'Add your name, state, and a few optional details';

  it("shows the cookie user's claims, matches and closing-soon list", async () => {
    const html = await render();
    expect(h.claimReads).toEqual(['user-a']);
    expect(h.reads.find((r) => r.table === 'profiles')).toMatchObject({ client: 'cookie', filters: [['id', 'user-a']] });
    expect(html).toContain('Hi, Ada.');
    expect(html).toContain('>Tracked one<');
    expect(html).toContain('Strong match');
    expect(html).toContain('href="/claim/breach"');
    expect(html).toContain('href="/claim/state-only"');
    expect(html).not.toContain(ONBOARDING_CARD);
    expect(html).not.toContain('load matches right now');
  });

  it('shows the onboarding card only to a user who is not onboarded', async () => {
    h.profile = { full_name: null, onboarded: false, state: null, attributes: {} };
    const html = await render();
    expect(html).toContain(ONBOARDING_CARD);
    expect(html).not.toContain('Hi, ');

    h.profile = { full_name: 'Grace', onboarded: true, state: null, attributes: {} };
    expect(await render()).not.toContain(ONBOARDING_CARD);
  });

  it('shows the claims and catalog errors instead of empty lists', async () => {
    h.claims = { items: [], failed: true };
    h.catalog = { lawsuits: [], error: true };
    const html = await render();
    expect(html).toContain('load your claims right now.');
    expect(html).toContain('load matches right now.');
    expect(html).toContain('load settlements right now.');
  });

  it('sends a signed-out visitor to log in', async () => {
    h.cookieUser = null;
    await expect(render()).rejects.toThrow('NEXT_REDIRECT /login?next=/dashboard');
    expect(h.claimReads).toEqual([]);
  });
});
