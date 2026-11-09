import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimScreenResponse, DashboardResponse } from '@/lib/mobile-contract';

// Every surface that shows, checks or schedules a deadline reads a guided
// settlement's official deadline and link (src/lib/settlement-guides.ts), not
// the feed's: the catalog, the claim screen (web and app), claim writes, Your
// claims and the app's reminders. The real loaders and routes run; only
// Supabase is fake.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  lawsuits: [] as Record<string, unknown>[],
  claims: [] as Record<string, unknown>[],
  matches: [] as Record<string, unknown>[],
  profile: null as Record<string, unknown> | null,
  rpcs: [] as string[],
  calls: [] as unknown[][],
}));

vi.mock('@/lib/supabase/server', () => {
  const lawsuitById = (id: unknown) => db.lawsuits.find((l) => l.id === id) ?? null;
  const tables = (table: string): Row[] => {
    if (table === 'lawsuits') return db.lawsuits;
    if (table === 'claims') return db.claims;
    if (table === 'matches') return db.matches;
    if (table === 'profiles') return db.profile ? [db.profile] : [];
    return [];
  };
  // Applies .eq filters and embeds; the routes re-apply every other rule themselves.
  function query(table: string) {
    let select = '';
    const eqs: [string, unknown][] = [];
    const rows = () =>
      tables(table)
        .filter((row) => eqs.every(([column, value]) => row[column] === value))
        .map((row) => {
          if (select.includes('settlement:lawsuits')) return { ...row, settlement: lawsuitById(row.lawsuit_id) };
          if (select.includes('lawsuit:lawsuits')) return { ...row, lawsuit: lawsuitById(row.lawsuit_id) };
          return row;
        });
    const q: Record<string, unknown> = {};
    for (const name of ['in', 'or', 'not', 'order', 'ilike', 'limit', 'is', 'gte']) {
      q[name] = (...args: unknown[]) => {
        db.calls.push([name, ...args]);
        return q;
      };
    }
    q.select = (columns: string) => {
      select = columns;
      return q;
    };
    q.eq = (column: string, value: unknown) => {
      eqs.push([column, value]);
      return q;
    };
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
    return q;
  }
  const client = {
    from: query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcs.push(name);
      const claim = { ...db.claims[0], ...(name === 'claim_start_tracking' ? { status: args.p_status } : {}) };
      return { data: name === 'claim_start_tracking' ? { created: true, claim } : claim, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
  };
  return {
    createClient: async () => client,
    createPublicClient: () => client,
    createServiceClient: () => client,
    isSupabaseConfigured: () => true,
  };
});

vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/dashboard',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import { PATCH } from '@/app/api/claims/[id]/route';
import { POST as prepareAll } from '@/app/api/claims/prepare-all/route';
import { POST } from '@/app/api/claims/route';
import { GET as mobileClaim } from '@/app/api/mobile/claim/[slug]/route';
import { GET as mobileDashboard } from '@/app/api/mobile/dashboard/route';
import ClaimPage from '@/app/claim/[slug]/page';
import DashboardPage from '@/app/dashboard/page';
import SettlementPage from '@/app/lawsuits/[slug]/page';
import { addCalendarDays } from '@/lib/claim-deadlines';
import { getLawsuitBySlug, lookupLawsuits } from '@/lib/lawsuits';
import { catalogDeadlineFilter, getSettlementGuide } from '@/lib/settlement-guides';
import { formatDeadline } from '@/lib/utils';

const SLUG = 'six-flags-fees-california-class-action-settlement';
const guide = getSettlementGuide(SLUG);
if (!guide) throw new Error('expected a guide');
const OFFICIAL_DEADLINE = guide.deadline;
const day = (days: number) => addCalendarDays(OFFICIAL_DEADLINE, days) as string;
/** Noon in New York, `days` after the official deadline. */
const at = (days: number) => new Date(`${day(days)}T17:00:00Z`);

const LAWSUIT_ID = '00000000-0000-4000-8000-0000000000d1';
const CLAIM_ID = '00000000-0000-4000-8000-0000000000c1';
const FEED_URL = 'https://www.feed-admin.example/six-flags';
/** The feed's deadline: later than the official one. */
const FEED_DEADLINE = day(45);

function feedRow(): Row {
  return {
    id: LAWSUIT_ID,
    slug: SLUG,
    title: 'Six Flags fees',
    summary: null,
    description: null,
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    typical_payout: null,
    proof_required: false,
    deadline: FEED_DEADLINE,
    eligibility: { proof: 'unknown' },
    eligibility_text: null,
    source_url: null,
    claim_url: FEED_URL,
    external_id: null,
    is_featured: false,
    administrator: null,
    form_field_order: null,
  };
}
function claimRow(overrides: Row = {}): Row {
  return {
    id: CLAIM_ID,
    user_id: 'user-a',
    lawsuit_id: LAWSUIT_ID,
    lawsuit_title: 'Six Flags fees',
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
async function claimScreen(): Promise<ClaimScreenResponse> {
  const res = await mobileClaim(new Request(`http://localhost/api/mobile/claim/${SLUG}`), {
    params: Promise.resolve({ slug: SLUG }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as ClaimScreenResponse;
}
async function dashboard(): Promise<DashboardResponse> {
  const res = await mobileDashboard(new Request('http://localhost/api/mobile/dashboard'));
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardResponse;
}
const startClaim = (body: Row) => POST(new Request('http://localhost/api/claims', json(body)));
const reportFiled = () =>
  PATCH(new Request(`http://localhost/api/claims/${CLAIM_ID}`, { ...json({ action: 'report_filed' }), method: 'PATCH' }), {
    params: Promise.resolve({ id: CLAIM_ID }),
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  db.lawsuits = [feedRow()];
  db.claims = [claimRow()];
  db.matches = [];
  db.profile = { id: 'user-a', full_name: 'Ada Lovelace', onboarded: true, state: 'CA', attributes: {} };
  db.rpcs = [];
  db.calls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the catalog (lookupLawsuits; the app’s fetchCatalog takes the same steps)', () => {
  const KIA = 'kia-optima-sportage-window-regulator-settlement';
  const SQUATCH = 'dr-squatch-all-natural-product-claims-settlement';
  const NAVY = 'navy-federal-credit-union-unauthorized-personal-loan-accounts-class-action-settl';
  const official = (slug: string) => getSettlementGuide(slug)?.deadline as string;
  const plus = (date: string, days: number) => addCalendarDays(date, days) as string;
  const row = (id: string, slug: string, deadline: string): Row => ({ ...feedRow(), id, slug, deadline, claim_url: `https://feed.example/${id}` });
  // Noon in New York the day after the Kia guide's deadline: that one has passed, the others have not.
  const now = new Date(`${plus(official(KIA), 1)}T17:00:00Z`);

  beforeEach(() => {
    expect(official(KIA) < official(SQUATCH) && official(KIA) < official(NAVY)).toBe(true);
    db.lawsuits = [
      // In the feed's deadline order, as the database returns them.
      row('navy', NAVY, plus(official(KIA), -10)), // passed in the feed, open on the official site
      row('plain', 'plain-settlement', plus(official(SQUATCH), 1)),
      row('kia', KIA, plus(official(KIA), 60)), // open in the feed, past the official deadline
      row('squatch', SQUATCH, plus(official(SQUATCH), 90)), // later in the feed than officially
    ];
  });

  it('reads every guided row, then lists and orders by the official deadline', async () => {
    const { lawsuits } = await lookupLawsuits(undefined, now);
    expect(db.calls).toContainEqual(['or', catalogDeadlineFilter(now)]);
    // A passed official deadline does not list as open, whatever the feed says.
    expect(lawsuits.map((l) => l.slug)).not.toContain(KIA);
    // A feed deadline later than the official one shows, and sorts by, the official one.
    expect(lawsuits.find((l) => l.slug === SQUATCH)).toMatchObject({
      deadline: official(SQUATCH),
      claim_url: getSettlementGuide(SQUATCH)?.officialUrl,
    });
    expect(lawsuits.findIndex((l) => l.slug === SQUATCH)).toBeLessThan(lawsuits.findIndex((l) => l.slug === 'plain-settlement'));
    // A feed deadline that passed before the official one still lists.
    expect(lawsuits.find((l) => l.slug === NAVY)?.deadline).toBe(official(NAVY));
    const deadlines = lawsuits.map((l) => l.deadline as string);
    expect(deadlines).toEqual([...deadlines].sort());
    expect(lawsuits).toHaveLength(3);
  });

  it('takes the limit after that order, not in the query', async () => {
    expect((await lookupLawsuits({ limit: 1 }, now)).lawsuits.map((l) => l.slug)).toEqual([SQUATCH]);
    expect(db.calls.filter(([name]) => name === 'limit')).toEqual([]);
  });

  it('a settlement page past its official deadline reads closed, with the official facts', async () => {
    vi.setSystemTime(now);
    expect(await getLawsuitBySlug(KIA)).toBeNull();
    expect(await getLawsuitBySlug(KIA, { includeClosed: true })).toMatchObject({
      deadline: official(KIA),
      claim_url: getSettlementGuide(KIA)?.officialUrl,
    });
  });
});

describe('a guided settlement whose feed deadline is later than the official one', () => {
  beforeEach(() => {
    expect(FEED_DEADLINE > OFFICIAL_DEADLINE).toBe(true);
    vi.setSystemTime(at(-10));
  });

  it('the app’s claim screen shows the official deadline, link, who-qualifies text and proof rule', async () => {
    const body = await claimScreen();
    expect(body).toMatchObject({
      kind: 'flow',
      settlement: {
        deadline: OFFICIAL_DEADLINE,
        officialUrl: guide.officialUrl,
        eligibility: guide.eligibilityText,
        proof: 'none',
      },
      context: { deadline: OFFICIAL_DEADLINE, deadlinePassed: false, openForClaims: true },
    });
    expect(JSON.stringify(body)).not.toContain(FEED_DEADLINE);
    expect(JSON.stringify(body)).not.toContain(FEED_URL);
  });

  it('the web claim page shows the same deadline and link', async () => {
    const html = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(html).toContain(formatDeadline(OFFICIAL_DEADLINE));
    expect(html).toContain(`href="${guide.officialUrl}"`);
    expect(html).not.toContain(formatDeadline(FEED_DEADLINE));
    expect(html).not.toContain(FEED_URL);
  });

  it('Your claims shows, and the app schedules its reminders for, the official deadline', async () => {
    const body = await dashboard();
    expect(body.reminders).toEqual([{ claimId: CLAIM_ID, slug: SLUG, title: 'Six Flags fees', deadline: OFFICIAL_DEADLINE }]);
    expect(body.claims.rows).toMatchObject([
      { claimId: CLAIM_ID, group: 'needs_filing', deadlineText: `Deadline ${formatDeadline(OFFICIAL_DEADLINE)} · 10 days left` },
    ]);
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain(`Deadline ${formatDeadline(OFFICIAL_DEADLINE)}`);
    expect(html).not.toContain(formatDeadline(FEED_DEADLINE));
  });

  it('stored matches show the official deadline and link (MATCH_STORE_ENABLED)', async () => {
    vi.stubEnv('MATCH_STORE_ENABLED', '1');
    db.claims = [];
    db.matches = [{ id: 'm1', user_id: 'user-a', lawsuit_id: LAWSUIT_ID, score: 0.9, reasons: ['In CA'], dismissed: false }];
    const { matches } = await dashboard();
    expect([...matches.strong, ...matches.possible]).toMatchObject([
      { slug: SLUG, officialUrl: guide.officialUrl, deadlineText: `Deadline ${formatDeadline(OFFICIAL_DEADLINE)} · 10 days left` },
    ]);
  });
});

describe('after the official deadline, while the feed still says open', () => {
  it('schedules no reminder, and Your claims reads deadline passed', async () => {
    vi.setSystemTime(at(1));
    const body = await dashboard();
    expect(body.reminders).toEqual([]);
    expect(body.claims.rows).toMatchObject([
      { claimId: CLAIM_ID, group: 'closed', deadlineText: `Deadline was ${formatDeadline(OFFICIAL_DEADLINE)}` },
    ]);
  });

  it('shows no stored match on it', async () => {
    vi.setSystemTime(at(1));
    vi.stubEnv('MATCH_STORE_ENABLED', '1');
    db.claims = [];
    db.matches = [{ id: 'm1', user_id: 'user-a', lawsuit_id: LAWSUIT_ID, score: 0.9, reasons: ['In CA'], dismissed: false }];
    const { matches } = await dashboard();
    expect([...matches.strong, ...matches.possible]).toEqual([]);
  });

  it('refuses to save it before filing, and takes a filing report for 30 days', async () => {
    db.claims = [];
    vi.setSystemTime(at(1));
    const save = await startClaim({ lawsuit_id: LAWSUIT_ID });
    expect(save.status).toBe(409);
    expect(await save.json()).toMatchObject({ code: 'settlement_closed' });
    expect(db.rpcs).toEqual([]);

    const report = await startClaim({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' });
    expect(report.status).toBe(201);
    expect(db.rpcs).toEqual(['claim_start_tracking']);

    db.rpcs = [];
    vi.setSystemTime(at(31));
    const late = await startClaim({ lawsuit_id: LAWSUIT_ID, intent: 'report_filed' });
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ code: 'window_closed' });
    expect(db.rpcs).toEqual([]);
  });

  it('accepts "I filed" on a tracked claim until 30 days after the official deadline', async () => {
    vi.setSystemTime(at(30));
    expect((await reportFiled()).status).toBe(200);
    expect(db.rpcs).toEqual(['claim_apply_change']);

    db.rpcs = [];
    vi.setSystemTime(at(31));
    const late = await reportFiled();
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ code: 'window_closed' });
    expect(db.rpcs).toEqual([]);
  });

  it('the claim screen without a claim takes a report, then reads closed with the official facts', async () => {
    db.claims = [];
    vi.setSystemTime(at(1));
    expect(await claimScreen()).toMatchObject({
      kind: 'flow',
      claim: null,
      context: { deadline: OFFICIAL_DEADLINE, deadlinePassed: true, openForClaims: false, lateReportOpen: true },
    });

    vi.setSystemTime(at(31));
    expect(await claimScreen()).toEqual({
      kind: 'closed',
      slug: SLUG,
      title: 'Six Flags fees',
      category: 'Consumer',
      deadline: OFFICIAL_DEADLINE,
      deadlinePassed: true,
      officialUrl: guide.officialUrl,
    });
  });
});

describe('a feed link to the claim form on the official site', () => {
  // The feed's deep link on the guide's own host (src/lib/settlement-guides.ts guidedClaimUrl).
  const FORM = `${guide.officialUrl}submit-claim`;
  beforeEach(() => {
    expect(FORM).toBe('https://www.knottsgreatamericasettlement.com/submit-claim');
    db.lawsuits = [{ ...feedRow(), claim_url: FORM }];
    vi.setSystemTime(at(-10));
  });

  it('is what "Open the official claim form" opens, in the app and on the web', async () => {
    expect(await claimScreen()).toMatchObject({ kind: 'flow', settlement: { officialUrl: FORM, deadline: OFFICIAL_DEADLINE } });
    const html = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(html).toMatch(new RegExp(`href="${FORM}"[^>]*>Open the official claim form`));
  });

  it('is the corrective notice’s link too, on the claim page and on Your claims', async () => {
    db.claims = [claimRow({ status: 'submitted' })]; // the old flow's "filed" with no confirmation
    const html = renderToStaticMarkup(await ClaimPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(html).toMatch(new RegExp(`href="${FORM}"[^>]*>Open the official claim form`));
    expect((await dashboard()).claims.notices).toMatchObject([{ claimId: CLAIM_ID, officialUrl: FORM }]);
  });

  it('the catalog and the settlement page keep the official site, where the notice is', async () => {
    expect((await lookupLawsuits(undefined, at(-10))).lawsuits.map((l) => l.claim_url)).toEqual([guide.officialUrl]);
    expect((await getLawsuitBySlug(SLUG))?.claim_url).toBe(guide.officialUrl);
    const html = renderToStaticMarkup(await SettlementPage({ params: Promise.resolve({ slug: SLUG }) }));
    expect(html).toContain(`href="${guide.officialUrl}"`);
    expect(html).not.toContain(FORM);
  });
});

describe('Prepare all (POST /api/claims/prepare-all) on a guided settlement', () => {
  beforeEach(() => {
    db.claims = [];
    db.matches = [{ id: 'm1', user_id: 'user-a', lawsuit_id: LAWSUIT_ID, score: 0.9, reasons: [], dismissed: false }];
  });

  it('starts tracking it while the official deadline is ahead, though the feed’s has passed', async () => {
    db.lawsuits = [{ ...feedRow(), deadline: day(-30) }];
    vi.setSystemTime(at(-10));
    expect(await (await prepareAll()).json()).toMatchObject({ prepared: 1 });
    expect(db.rpcs).toEqual(['claim_start_tracking']);
  });

  it('does not once the official deadline has passed, though the feed’s is ahead', async () => {
    vi.setSystemTime(at(1));
    expect(await (await prepareAll()).json()).toMatchObject({ prepared: 0 });
    expect(db.rpcs).toEqual([]);
  });
});
