import {
  SETTLEMENT_GUIDES,
  SETTLEMENT_GUIDES_VERSION,
  getSettlementGuide,
  settlementProofDetail,
  type SettlementGuide,
} from '@shared/lib/settlement-guides';
import { settlementFaqs } from '@shared/lib/settlement-seo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  fetchCatalog,
  fetchSettlementBySlug,
  toLawsuit,
  useCatalog,
  useSettlement,
  type CatalogLawsuit,
} from '@/data/catalog';
import { applyConfigGuides, guidesInUse } from '@/data/guides';
import { ConfigProvider, fetchClientConfig, useConfig } from '@/providers/ConfigProvider';

// The official-notice guides the catalog and settlement screens overlay come
// from GET /api/mobile/config when it has them (src/data/guides.ts), so they
// agree with the server's claim screen, dashboard and reminders.

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown; status: number };

const mockState: {
  calls: Call[];
  result: Result;
  /** Reads wait for these in turn: the first read for the first, and so on. */
  holds: Promise<void>[];
  /** When set, a read's answer from its own `or` filter, as the server filters. */
  serve: ((filter: string) => Result) | null;
} = {
  calls: [],
  result: { data: [], error: null, status: 200 },
  holds: [],
  serve: null,
};

function mockBuilder() {
  const builder: Record<string, unknown> = {};
  const hold = mockState.holds.shift() ?? Promise.resolve();
  let filter = '';
  for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'abortSignal', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      mockState.calls.push({ method, args });
      if (method === 'or') filter = String(args[0]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    hold.then(() => mockState.serve?.(filter) ?? mockState.result).then(resolve, reject);
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

// 10:00 in New York on Nov 2, 2026.
jest.mock('@/lib/clock', () => ({ now: () => new Date('2026-11-02T15:00:00Z'), recordServerTime: () => undefined }));

/** The config answer; `gate` holds it back until a test lets it through. */
const mockApi: { paths: string[]; answer: () => unknown; gate: Promise<void> } = {
  paths: [],
  answer: () => ({}),
  gate: Promise.resolve(),
};
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({
    request: async (path: string, options: { parse?: (json: unknown) => unknown } = {}) => {
      mockApi.paths.push(path);
      await mockApi.gate;
      const json = JSON.parse(JSON.stringify(mockApi.answer()));
      return { ok: true, status: 200, data: options.parse ? options.parse(json) : json };
    },
  }),
}));

const SIX = 'six-flags-fees-california-class-action-settlement';
const NEW_SLUG = 'brand-new-guided-settlement';
const BUNDLED_SIX = SETTLEMENT_GUIDES.find((guide) => guide.slugs.includes(SIX)) as SettlementGuide;

/** The server's copy: Six Flags' facts edited, and a guide the app has never seen. */
const SERVER_GUIDES: SettlementGuide[] = [
  ...SETTLEMENT_GUIDES.filter((guide) => guide !== BUNDLED_SIX),
  {
    ...BUNDLED_SIX,
    deadline: '2027-01-15',
    typicalPayout: 'Edited payout.',
    proofDetail: 'Edited proof rule.',
    extraFaqs: [{ q: 'Edited question?', a: 'Edited answer.' }],
  },
  { ...BUNDLED_SIX, slugs: [NEW_SLUG], officialUrl: 'https://www.brand-new-settlement.com/', deadline: '2026-12-15' },
];
const SERVER_VERSION = 'server2';

function configAnswer(extra: Record<string, unknown> = {}) {
  return {
    apiVersion: 1,
    serverTime: '2026-11-02T15:00:00.000Z',
    todayDeadlineZone: '2026-11-02',
    flags: { ASSISTED_FILING_ENABLED: true },
    legal: { disclaimer: 'Disclaimer.', short: 'Short.', contactEmail: null },
    minBuild: { ios: 0, android: 0 },
    ...extra,
  };
}
const withServerGuides = () => configAnswer({ guidesVersion: SERVER_VERSION, guides: SERVER_GUIDES });

function row(slug: string, deadline: string | null): Record<string, unknown> {
  return {
    id: `id-${slug}`,
    slug,
    title: `Title ${slug}`,
    summary: null,
    description: null,
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    typical_payout: 'Feed payout.',
    proof_required: false,
    deadline,
    eligibility: {},
    eligibility_text: null,
    source_url: null,
    claim_url: 'https://www.knottsgreatamericasettlement.com/submit-claim',
    external_id: null,
    is_featured: false,
    administrator: null,
    verified_at: null,
    eligibility_verified: null,
    proof_verified: null,
  };
}

const calls = (method: string) => mockState.calls.filter((call) => call.method === method).map((call) => call.args);
/** The slugs a catalog filter reads whatever their feed deadline (its "slug.in.(…)" part). */
const namedSlugs = (filter: unknown) => /slug\.in\.\(([^)]*)\)/.exec(String(filter))?.[1].split(',') ?? [];

beforeEach(() => {
  applyConfigGuides({}); // the bundled guides
  mockState.calls = [];
  mockState.result = { data: [], error: null, status: 200 };
  mockState.holds = [];
  mockState.serve = null;
  mockApi.paths = [];
  mockApi.answer = () => configAnswer();
  mockApi.gate = Promise.resolve();
});

describe('the config’s guides', () => {
  it('asks with the version the app has, and takes a list that differs', async () => {
    mockApi.answer = withServerGuides;
    const changed = jest.fn();
    const config = await fetchClientConfig(undefined, changed);
    expect(mockApi.paths).toEqual([`/api/mobile/config?guides=${SETTLEMENT_GUIDES_VERSION}`]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(config.guides).toMatchObject({ version: SERVER_VERSION, fromServer: true });
    expect(config.flags).toEqual({ ASSISTED_FILING_ENABLED: true });
    expect(getSettlementGuide(SIX)?.deadline).toBe('2027-01-15');
    expect(getSettlementGuide(NEW_SLUG)?.officialUrl).toBe('https://www.brand-new-settlement.com/');
  });

  it('keeps the list it has when the server confirms that version', async () => {
    mockApi.answer = withServerGuides;
    await fetchClientConfig();
    mockApi.answer = () => configAnswer({ guidesVersion: SERVER_VERSION });
    const changed = jest.fn();
    expect((await fetchClientConfig(undefined, changed)).guides).toMatchObject({ version: SERVER_VERSION, fromServer: true });
    expect(mockApi.paths[1]).toBe(`/api/mobile/config?guides=${SERVER_VERSION}`);
    expect(changed).not.toHaveBeenCalled();
    expect(getSettlementGuide(SIX)?.deadline).toBe('2027-01-15');
  });

  it('goes back to the bundled guides when the server has none (an older server)', async () => {
    mockApi.answer = withServerGuides;
    await fetchClientConfig();
    mockApi.answer = () => configAnswer();
    const changed = jest.fn();
    expect((await fetchClientConfig(undefined, changed)).guides).toEqual({
      version: SETTLEMENT_GUIDES_VERSION,
      guides: SETTLEMENT_GUIDES,
      fromServer: false,
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(getSettlementGuide(SIX)).toBe(BUNDLED_SIX);
    expect(getSettlementGuide(NEW_SLUG)).toBeUndefined();
  });

  it('keeps the bundled guides when one guide in the list cannot be read, and the rest of the config still applies', async () => {
    const broken = [{ ...SERVER_GUIDES[0], deadline: 'soon' }, ...SERVER_GUIDES.slice(1)];
    mockApi.answer = () => configAnswer({ guidesVersion: 'server3', guides: broken });
    const changed = jest.fn();
    const config = await fetchClientConfig(undefined, changed);
    expect(config.guides.fromServer).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(getSettlementGuide(SIX)).toBe(BUNDLED_SIX);
    expect(config.flags).toEqual({ ASSISTED_FILING_ENABLED: true });
    expect(config.legal.disclaimer).toBe('Disclaimer.');
  });

  it('reads a proof rule it does not know as unknown, and needs no sourceChecked', async () => {
    const { sourceChecked: _unused, ...withoutDate } = SERVER_GUIDES[0];
    const later = [{ ...withoutDate, proof: 'sometimes' }, ...SERVER_GUIDES.slice(1)];
    mockApi.answer = () => configAnswer({ guidesVersion: 'server5', guides: later });
    await fetchClientConfig();
    expect(guidesInUse()).toMatchObject({ version: 'server5', fromServer: true });
    expect(getSettlementGuide(SERVER_GUIDES[0].slugs[0])?.proof).toBe('unknown');
  });

  it('never takes a slug that could change the catalog query', async () => {
    const odd = [...SERVER_GUIDES, { ...BUNDLED_SIX, slugs: ['x),status.eq.closed'] }];
    mockApi.answer = () => configAnswer({ guidesVersion: 'server4', guides: odd });
    await fetchClientConfig();
    expect(guidesInUse().fromServer).toBe(false);
  });

  it('changes nothing when the server confirms the bundled version', async () => {
    mockApi.answer = () => configAnswer({ guidesVersion: SETTLEMENT_GUIDES_VERSION });
    const changed = jest.fn();
    expect((await fetchClientConfig(undefined, changed)).guides).toMatchObject({
      version: SETTLEMENT_GUIDES_VERSION,
      fromServer: true,
    });
    expect(changed).not.toHaveBeenCalled();
    expect(getSettlementGuide(SIX)).toBe(BUNDLED_SIX);
  });
});

describe('the catalog and settlement screens with the server’s guides', () => {
  beforeEach(async () => {
    mockApi.answer = withServerGuides;
    await fetchClientConfig();
  });

  it('query, filter and sort the catalog by the server’s copy', async () => {
    mockState.result.data = [
      row(SIX, '2026-11-30'),
      row('plain-settlement', '2026-12-20'),
      row(NEW_SLUG, '2026-10-01'), // past in the feed; the server's guide has it open
    ];
    const rows = await fetchCatalog();
    expect(String(calls('or')[0][0])).toContain(`,${NEW_SLUG})`);
    expect(rows.map((lawsuit) => [lawsuit.slug, lawsuit.deadline])).toEqual([
      [NEW_SLUG, '2026-12-15'],
      ['plain-settlement', '2026-12-20'],
      [SIX, '2027-01-15'],
    ]);
    expect(rows[2]).toMatchObject({ typical_payout: 'Edited payout.', claim_url: BUNDLED_SIX.officialUrl });

    // The bundled copy again: its own deadline, and the unknown slug is past its feed deadline.
    applyConfigGuides({});
    const bundled = await fetchCatalog();
    expect(bundled.map((lawsuit) => [lawsuit.slug, lawsuit.deadline])).toEqual([
      ['plain-settlement', '2026-12-20'],
      [SIX, BUNDLED_SIX.deadline],
    ]);
    expect(String(calls('or')[1][0])).not.toContain(NEW_SLUG);
  });

  it('show it on the settlement screen: the facts, the proof note and the FAQ', async () => {
    mockState.result.data = row(SIX, '2026-11-30');
    const found = await fetchSettlementBySlug(SIX);
    if (found.status !== 'found') throw new Error('expected a settlement');
    expect(found.lawsuit).toMatchObject({ deadline: '2027-01-15', typical_payout: 'Edited payout.', guidesVersion: SERVER_VERSION });
    // The row carries the guide's text, so the screen never reads it from guides changed since.
    expect(found.lawsuit.proofNote).toBe('Edited proof rule.');
    expect(found.lawsuit.proofNote).toBe(settlementProofDetail(found.lawsuit));
    expect(found.lawsuit.faqs).toContainEqual({ q: 'Edited question?', a: 'Edited answer.' });
    expect(found.lawsuit.faqs).toEqual(settlementFaqs(toLawsuit(found.lawsuit)));
  });

  it('open a listed settlement from its catalog row, with the proof note and FAQ of the same guides', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    mockState.result.data = [row(SIX, '2026-11-30')];
    client.setQueryData(['catalog'], await fetchCatalog());
    mockState.calls = [];
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = await renderHook(() => useSettlement(SIX).data, { wrapper });
    expect(result.current).toMatchObject({ status: 'found', lawsuit: { deadline: '2027-01-15', proofNote: 'Edited proof rule.' } });
    expect(calls('from')).toEqual([]);
    client.clear();
  });
});

describe('ConfigProvider', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          <ConfigProvider>{children}</ConfigProvider>
        </QueryClientProvider>
      );
    }
    return { client, wrapper };
  }

  async function renderCatalog() {
    const { client, wrapper } = setup();
    const { result } = await renderHook(
      () => {
        const catalog = useCatalog();
        const config = useConfig();
        return { rows: catalog.data, fetching: catalog.isFetching, status: config.status, guides: config.guides };
      },
      { wrapper },
    );
    return { client, result };
  }

  it('reads the catalog again when the config’s guides arrive and differ, and exposes them', async () => {
    let answer: () => void = () => undefined;
    mockApi.gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    mockApi.answer = withServerGuides;
    mockState.result.data = [row(SIX, '2026-11-30')];
    const { client, result } = await renderCatalog();
    // Before the config answers: the bundled guides.
    await waitFor(() => expect(result.current.rows?.[0]?.deadline).toBe(BUNDLED_SIX.deadline));
    expect(result.current.guides).toMatchObject({ version: SETTLEMENT_GUIDES_VERSION, fromServer: false });
    expect(calls('from')).toHaveLength(1);

    await act(async () => answer());
    // The catalog is read again as the config's guides are taken, and the
    // context exposes them once the config answer is in.
    await waitFor(() => expect(result.current.rows?.[0]?.deadline).toBe('2027-01-15'));
    await waitFor(() => expect(result.current.guides).toMatchObject({ version: SERVER_VERSION, fromServer: true }));
    expect(result.current.rows?.[0]?.typical_payout).toBe('Edited payout.');
    expect(calls('from')).toHaveLength(2);
    client.clear();
  });

  it('does not read it again when the server has the same guides', async () => {
    let answer: () => void = () => undefined;
    mockApi.gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    mockApi.answer = () => configAnswer({ guidesVersion: SETTLEMENT_GUIDES_VERSION });
    mockState.result.data = [row(SIX, '2026-11-30')];
    const { client, result } = await renderCatalog();
    await waitFor(() => expect(result.current.rows).toBeDefined());
    await act(async () => answer());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.rows?.map((lawsuit: CatalogLawsuit) => lawsuit.deadline)).toEqual([BUNDLED_SIX.deadline]);
    expect(calls('from')).toHaveLength(1);
    client.clear();
  });

  it('reads the catalog again when the guides arrive during its first read, whose filter named the bundled slugs', async () => {
    let releaseFirstRead: () => void = () => undefined;
    mockState.holds = [
      new Promise<void>((resolve) => {
        releaseFirstRead = resolve;
      }),
    ];
    let answer: () => void = () => undefined;
    mockApi.gate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    mockApi.answer = withServerGuides;
    // As the server filters: a passed feed deadline is read only for a slug the filter names.
    mockState.serve = (filter) => ({
      data: [row(SIX, '2026-11-30'), row(NEW_SLUG, '2026-10-01')].filter(
        (lawsuit) => String(lawsuit.deadline) >= '2026-11-02' || namedSlugs(filter).includes(String(lawsuit.slug)),
      ),
      error: null,
      status: 200,
    });
    const { client, result } = await renderCatalog();
    await waitFor(() => expect(calls('from')).toHaveLength(1));
    expect(namedSlugs(calls('or')[0][0])).not.toContain(NEW_SLUG);

    await act(async () => answer());
    // The held read is cancelled (its request aborted), and the catalog read again names the server's slugs.
    await waitFor(() => expect(result.current.rows?.map((lawsuit) => lawsuit.slug)).toEqual([NEW_SLUG, SIX]));
    expect(calls('from')).toHaveLength(2);
    expect(namedSlugs(calls('or')[1][0])).toContain(NEW_SLUG);
    expect((calls('abortSignal')[0][0] as AbortSignal).aborted).toBe(true);

    // The first read's late answer changes nothing.
    await act(async () => {
      releaseFirstRead();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.rows?.map((lawsuit) => [lawsuit.slug, lawsuit.deadline])).toEqual([
      [NEW_SLUG, '2026-12-15'],
      [SIX, '2027-01-15'],
    ]);
    expect(calls('from')).toHaveLength(2);
    client.clear();
  });
});

describe('a settlement opened after the guides changed, before the catalog is read again', () => {
  it('is read itself, not taken from the catalog copy overlaid with the old guides', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    mockState.result.data = [row(SIX, '2026-11-30')];
    client.setQueryData(['catalog'], await fetchCatalog());
    expect(client.getQueryData<CatalogLawsuit[]>(['catalog'])?.[0]?.deadline).toBe(BUNDLED_SIX.deadline);
    mockApi.answer = withServerGuides;
    await fetchClientConfig();
    mockState.calls = [];
    mockState.result.data = row(SIX, '2026-11-30');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = await renderHook(
      () => {
        const query = useSettlement(SIX);
        return { data: query.data };
      },
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.data).toMatchObject({
        status: 'found',
        lawsuit: { deadline: '2027-01-15', proofNote: 'Edited proof rule.', guidesVersion: SERVER_VERSION },
      }),
    );
    expect(calls('from')).toEqual([['lawsuits']]);
    client.clear();
  });
});
