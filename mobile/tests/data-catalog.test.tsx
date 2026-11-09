import { addCalendarDays } from '@shared/lib/claim-deadlines';
import { FICTIONAL_SLUGS } from '@shared/lib/fictional-slugs';
import { GUIDED_SLUGS, getSettlementGuide } from '@shared/lib/settlement-guides';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { common } from '@/copy/common';
import {
  CATALOG_COLUMNS,
  fetchCatalog,
  fetchSettlementBySlug,
  toLawsuit,
  useCatalog,
  useSettlement,
  type CatalogLawsuit,
} from '@/data/catalog';
import { ApiRequestError } from '@/lib/api';

type Call = { method: string; args: unknown[] };

const mockState: { calls: Call[]; result: { data: unknown; error: unknown; status: number } } = {
  calls: [],
  result: { data: [], error: null, status: 200 },
};

/** A PostgREST builder that records every call and resolves with mockState.result. */
function mockBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'abortSignal', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      mockState.calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mockState.result).then(resolve, reject);
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      mockState.calls.push({ method: 'from', args: [table] });
      return mockBuilder();
    },
  }),
}));

// 10:00 in New York on Nov 2, 2026: today in the deadline zone is 2026-11-02.
const DEFAULT_NOW = '2026-11-02T15:00:00Z';
const mockClock = { now: new Date(DEFAULT_NOW) };
jest.mock('@/lib/clock', () => ({ now: () => mockClock.now }));

function row(overrides: Partial<CatalogLawsuit> & { slug: string }): Record<string, unknown> {
  return {
    id: `id-${overrides.slug}`,
    title: `Title ${overrides.slug}`,
    summary: null,
    description: null,
    category: 'Data breach',
    status: 'open',
    review_status: 'published',
    typical_payout: '$50',
    proof_required: false,
    deadline: '2026-12-01',
    eligibility: {},
    eligibility_text: null,
    source_url: null,
    claim_url: 'https://www.acme-settlement.example/claim',
    external_id: null,
    is_featured: false,
    administrator: null,
    verified_at: null,
    eligibility_verified: null,
    proof_verified: null,
    // Never selected, but harmless if a row carries it.
    raw_source_text: 'internal',
    ...overrides,
  };
}

/** A catalog slug src/lib/settlement-guides.ts has an official-notice guide for. */
const GUIDED_SLUG = 'six-flags-fees-california-class-action-settlement';

function guideFor(slug: string) {
  const guide = getSettlementGuide(slug);
  if (!guide) throw new Error('expected a guide');
  return guide;
}

/** `days` after the guide's official deadline, YYYY-MM-DD. */
function officialPlus(days: number): string {
  return addCalendarDays(guideFor(GUIDED_SLUG).deadline, days) as string;
}

function calls(method: string): unknown[][] {
  return mockState.calls.filter((call) => call.method === method).map((call) => call.args);
}

beforeEach(() => {
  mockState.calls = [];
  mockState.result = { data: [], error: null, status: 200 };
  mockClock.now = new Date(DEFAULT_NOW);
});

describe('catalog query', () => {
  it('lists the plan 1.1 columns, never the internal ones', () => {
    expect(CATALOG_COLUMNS).toBe(
      'id, slug, title, summary, description, category, status, review_status, typical_payout, proof_required, deadline, eligibility, eligibility_text, source_url, claim_url, external_id, is_featured, administrator, verified_at, eligibility_verified, proof_verified',
    );
    expect(CATALOG_COLUMNS).not.toMatch(/raw_source_text|reviewed_by|verified_by/);
  });

  it('builds the web catalog query: published, open statuses, deadline today or later (or guided), no fictional slugs, ordered', async () => {
    const controller = new AbortController();
    await fetchCatalog(controller.signal);

    expect(calls('from')).toEqual([['lawsuits']]);
    expect(calls('select')).toEqual([[CATALOG_COLUMNS]]);
    expect(calls('eq')).toEqual([['review_status', 'published']]);
    expect(calls('in')).toEqual([['status', ['open', 'closing_soon']]]);
    // Every guided slug too, whatever its feed deadline: its official deadline decides after the read.
    expect(calls('or')).toEqual([[`deadline.is.null,deadline.gte.2026-11-02,slug.in.(${GUIDED_SLUGS.join(',')})`]]);
    expect(GUIDED_SLUGS).toContain(GUIDED_SLUG);
    expect(calls('not')).toEqual([['slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`]]);
    expect(calls('order')).toEqual([
      ['deadline', { ascending: true, nullsFirst: false }],
      ['is_featured', { ascending: false }],
    ]);
    expect(calls('abortSignal')).toEqual([[controller.signal]]);
  });

  it('applies the open-for-claims rule again and keeps the deadline order', async () => {
    mockState.result.data = [
      row({ slug: 'open-soon', deadline: '2026-11-02' }), // last day today: still open
      row({ slug: 'passed', deadline: '2026-11-01' }),
      row({ slug: 'closed', status: 'closed' }),
      row({ slug: 'unpublished', review_status: 'draft' }),
      row({ slug: FICTIONAL_SLUGS[0] }),
      row({ slug: 'no-deadline', deadline: null }),
    ];
    const rows = await fetchCatalog();
    expect(rows.map((lawsuit) => lawsuit.slug)).toEqual(['open-soon', 'no-deadline']);
  });

  it('overlays the official-notice guides before the open rule and the order, as the web does', async () => {
    const guide = guideFor(GUIDED_SLUG);
    // The feed lists it before the plain row; its official deadline is after the plain row's.
    expect(guide.deadline > '2026-12-01').toBe(true);
    mockState.result.data = [
      row({ slug: GUIDED_SLUG, deadline: '2026-11-30', claim_url: 'https://feed.example/six-flags' }),
      row({ slug: 'plain' }),
    ];
    const rows = await fetchCatalog();
    expect(rows.map((lawsuit) => lawsuit.slug)).toEqual(['plain', GUIDED_SLUG]);
    expect(rows[1]).toMatchObject({
      slug: GUIDED_SLUG,
      deadline: guide.deadline,
      claim_url: guide.officialUrl,
      eligibility_text: guide.eligibilityText,
      typical_payout: guide.typicalPayout,
    });
    expect(rows[0]).toMatchObject({ slug: 'plain', deadline: '2026-12-01', claim_url: 'https://www.acme-settlement.example/claim' });
  });

  it('shows and sorts by the official deadline when the feed’s is later', async () => {
    mockState.result.data = [
      row({ slug: 'plain', deadline: officialPlus(1) }),
      row({ slug: GUIDED_SLUG, deadline: officialPlus(45), claim_url: 'https://feed.example/six-flags' }),
    ];
    const rows = await fetchCatalog();
    expect(rows.map((lawsuit) => [lawsuit.slug, lawsuit.deadline])).toEqual([
      [GUIDED_SLUG, guideFor(GUIDED_SLUG).deadline],
      ['plain', officialPlus(1)],
    ]);
  });

  it('does not list a guided settlement past its official deadline, whatever the feed says', async () => {
    mockClock.now = new Date(`${officialPlus(1)}T15:00:00Z`);
    mockState.result.data = [row({ slug: GUIDED_SLUG, deadline: officialPlus(45) }), row({ slug: 'plain', deadline: officialPlus(45) })];
    expect((await fetchCatalog()).map((lawsuit) => lawsuit.slug)).toEqual(['plain']);

    // One whose feed deadline passed first still lists until the official one.
    mockClock.now = new Date(`${officialPlus(-1)}T15:00:00Z`);
    mockState.result.data = [row({ slug: GUIDED_SLUG, deadline: officialPlus(-20) })];
    expect((await fetchCatalog()).map((lawsuit) => lawsuit.deadline)).toEqual([guideFor(GUIDED_SLUG).deadline]);
  });

  it('drops a row it cannot show and reads bad optional fields as missing', async () => {
    mockState.result.data = [
      row({ slug: 'good', typical_payout: 42 as unknown as string, eligibility: null as unknown as CatalogLawsuit['eligibility'] }),
      { ...row({ slug: 'no-title' }), title: null },
      { ...row({ slug: 'odd-status' }), status: 'paused' },
    ];
    const rows = await fetchCatalog();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'good', typical_payout: null, eligibility: {} });
    expect(rows[0]).not.toHaveProperty('raw_source_text');
  });

  it('turns a failed read into ApiRequestError: the network message without an answer', async () => {
    mockState.result = { data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 };
    await expect(fetchCatalog()).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 0,
      code: 'network',
      message: common.networkError.text,
    });

    mockState.result = { data: null, error: { message: 'relation does not exist', code: '42P01' }, status: 404 };
    const error = await fetchCatalog().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: '42P01', message: common.genericError.text });
  });

  it('treats an answer that is not a list as an error', async () => {
    mockState.result.data = { not: 'a list' };
    await expect(fetchCatalog()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('settlement lookup', () => {
  it('reads one published settlement by slug, open or closed', async () => {
    mockState.result.data = row({ slug: 'acme-breach', status: 'closed' });
    const result = await fetchSettlementBySlug('acme-breach');

    expect(result).toMatchObject({ status: 'found', lawsuit: { slug: 'acme-breach', status: 'closed' } });
    expect(calls('select')).toEqual([[CATALOG_COLUMNS]]);
    expect(calls('eq')).toEqual([
      ['slug', 'acme-breach'],
      ['review_status', 'published'],
    ]);
    expect(calls('maybeSingle')).toHaveLength(1);
  });

  it('overlays the official-notice guide when there is one (lookupLawsuitBySlug)', async () => {
    const guide = guideFor(GUIDED_SLUG);
    mockState.result.data = row({ slug: GUIDED_SLUG });
    await expect(fetchSettlementBySlug(GUIDED_SLUG)).resolves.toMatchObject({
      status: 'found',
      lawsuit: { slug: GUIDED_SLUG, deadline: guide.deadline, claim_url: guide.officialUrl },
    });
  });

  it('never requests a fictional slug and says it was fictional', async () => {
    const result = await fetchSettlementBySlug(FICTIONAL_SLUGS[1]);
    expect(result).toEqual({ status: 'missing', fictional: true });
    expect(mockState.calls).toEqual([]);
  });

  it('is missing for an unknown or unpublished slug', async () => {
    mockState.result.data = null;
    await expect(fetchSettlementBySlug('nope')).resolves.toEqual({ status: 'missing', fictional: false });

    mockState.result.data = row({ slug: 'pending', review_status: 'pending_review' });
    await expect(fetchSettlementBySlug('pending')).resolves.toEqual({ status: 'missing', fictional: false });
  });

  it('fails on an unreadable row or a failed read instead of guessing', async () => {
    mockState.result.data = { ...row({ slug: 'broken' }), id: null };
    await expect(fetchSettlementBySlug('broken')).rejects.toMatchObject({ code: 'invalid_response' });

    mockState.result = { data: null, error: { code: 'PGRST301' }, status: 500 };
    await expect(fetchSettlementBySlug('acme')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('fills the columns the app never reads, for helpers typed with Lawsuit', async () => {
    mockState.result.data = row({ slug: 'acme' });
    const found = await fetchSettlementBySlug('acme');
    if (found.status !== 'found') throw new Error('expected a settlement');
    const lawsuit = toLawsuit(found.lawsuit);
    expect(lawsuit).toMatchObject({ slug: 'acme', payout_min: null, raw_source_text: null, missed_feed_count: 0 });
  });
});

describe('catalog hooks', () => {
  function setup() {
    // Infinite gcTime: no garbage-collection timers outlive the test.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
    });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return { client, wrapper };
  }

  it('loads the catalog under the public ["catalog"] key', async () => {
    mockState.result.data = [row({ slug: 'acme' })];
    const { client, wrapper } = setup();
    // Read during render: React Query re-renders only for the fields a render used.
    const { result } = await renderHook(
      () => {
        const query = useCatalog();
        return { data: query.data, isSuccess: query.isSuccess };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['catalog'])).toEqual(result.current.data);
    expect(result.current.data?.map((lawsuit) => lawsuit.slug)).toEqual(['acme']);
    client.clear();
  });

  it('opens a settlement from the catalog copy without a request', async () => {
    const { client, wrapper } = setup();
    const cached = [row({ slug: 'acme' })];
    client.setQueryData(['catalog'], cached);

    const { result } = await renderHook(
      () => {
        const query = useSettlement('acme');
        return { data: query.data, isStale: query.isStale };
      },
      { wrapper },
    );
    expect(result.current.data).toEqual({ status: 'found', lawsuit: cached[0] });
    expect(result.current.isStale).toBe(false);
    expect(calls('from')).toEqual([]);
    client.clear();
  });

  it('reads a settlement that is not in the catalog', async () => {
    mockState.result.data = row({ slug: 'old-one', status: 'closed' });
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const query = useSettlement('old-one');
        return { data: query.data, isSuccess: query.isSuccess };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ status: 'found', lawsuit: { slug: 'old-one' } });
    expect(client.getQueryData(['settlement', 'old-one'])).toBe(result.current.data);
    client.clear();
  });
});
