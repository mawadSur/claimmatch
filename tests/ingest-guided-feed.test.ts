import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScrapedLawsuit } from '@/lib/types';

// The nightly ingest (ingestAndExtract) with a feed: a guided settlement
// (src/lib/settlement-guides.ts) goes by its official deadline, as the catalog
// does, when the feed reopens it, closes it or counts it among the open rows
// the circuit breaker allows for. The real pipeline runs; Supabase, the feed
// adapter and the decision log are fake.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  sourceId: '11111111-1111-4111-8111-111111111111',
  lawsuits: [] as Record<string, unknown>[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  feed: [] as unknown[],
  /** Reading the open rows fails, so the breaker counts the feed's rows instead. */
  failOpenRead: false,
}));

vi.mock('@/lib/supabase/server', () => {
  function lawsuits() {
    const filters: [string, unknown[]][] = [];
    const rows = () =>
      db.lawsuits
        .filter((row) => filters.every(([column, values]) => values.includes(row[column])))
        .map((row) => ({ ...row }));
    const q: Record<string, unknown> = {
      select: () => q,
      in: (column: string, values: unknown[]) => {
        filters.push([column, values]);
        return q;
      },
      range: async (from: number, to: number) =>
        db.failOpenRead
          ? { data: null, error: { message: 'read failed' } }
          : { data: rows().slice(from, to + 1), error: null },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      insert: async () => ({ error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          db.updates.push({ id, patch });
          const row = db.lawsuits.find((l) => l.id === id);
          if (row) Object.assign(row, patch);
          return { error: null };
        },
      }),
    };
    return q;
  }
  function sources() {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { id: db.sourceId, enabled: true }, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
    return q;
  }
  const client = {
    from: (table: string) => {
      if (table === 'lawsuits') return lawsuits();
      if (table === 'sources') return sources();
      throw new Error(`the ingest reads no ${table} here`);
    },
  };
  return {
    isSupabaseConfigured: () => true,
    createServiceClient: () => client,
    createPublicClient: () => client,
    createClient: async () => client,
  };
});

vi.mock('@/lib/scraper/sources', () => ({
  getSourceAdapters: () => [{ slug: 'fake-feed', name: 'Fake feed', fetch: async () => db.feed }],
}));
vi.mock('@/lib/held-closures', () => ({ recordHeldClosureDecision: async () => ({ ok: true }) }));

import { addCalendarDays } from '@/lib/claim-deadlines';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { getSettlementGuide } from '@/lib/settlement-guides';

const KIA = 'kia-optima-sportage-window-regulator-settlement';
const DEERE = 'john-deere-repair-services-antitrust-settlement';
const REALPAGE = 'realpage-rental-software-antitrust-settlement';
const official = (slug: string) => getSettlementGuide(slug)?.deadline as string;
const plus = (date: string, days: number) => addCalendarDays(date, days) as string;
// The day after the Kia guide's deadline, before the Deere and RealPage ones.
const TODAY = plus(official(KIA), 1);
const NOW = new Date(`${TODAY}T17:00:00Z`);

function row(id: string, slug: string, deadline: string, status = 'open'): Row {
  return {
    id,
    slug,
    status,
    deadline,
    review_status: 'published',
    reviewed_at: null,
    title: `Settlement ${id}`,
    claim_url: null,
    source_id: db.sourceId,
    external_id: `fake-feed:${id}`,
    last_seen_at: null,
    missed_feed_count: 0,
  };
}

/** The feed's record for a row: open, with the row's deadline, unless overridden. */
function listed(r: Row, overrides: Partial<ScrapedLawsuit> = {}): ScrapedLawsuit {
  return {
    external_id: r.external_id as string,
    title: r.title as string,
    deadline: r.deadline as string,
    status: 'open',
    ...overrides,
  };
}

const lawsuit = (id: string) => db.lawsuits.find((l) => l.id === id);
const plain = (n: number, deadline: string) =>
  Array.from({ length: n }, (_, i) => row(`plain-${i}`, `plain-settlement-${i}`, deadline));

beforeEach(() => {
  db.lawsuits = [];
  db.updates = [];
  db.feed = [];
  db.failOpenRead = false;
  vi.stubEnv('INGEST_DRY_RUN', '');
  vi.stubEnv('INGEST_MAX_CLOSE_SHARE', '');
  vi.stubEnv('INGEST_MISSING_FEED_CLOSE_AFTER', '');
  vi.stubEnv('INGEST_MISSING_CLOSE_QUEUE_ENABLED', '');
  vi.stubEnv('HELD_AUTO_CLOSE_PAST_DEADLINE', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(official(KIA) < TODAY && TODAY < official(DEERE) && TODAY < official(REALPAGE)).toBe(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('a guided settlement the feed lists as open', () => {
  it('stays closed after its official deadline, and reopens while that deadline is ahead', async () => {
    db.lawsuits = [
      // Open, and the feed's deadline is still ahead: the deadline pass closes it by the official one.
      row('kia', KIA, plus(official(KIA), 60)),
      // Closed earlier by the feed; its official deadline is still ahead.
      row('deere', DEERE, plus(TODAY, 30), 'closed'),
    ];
    db.feed = db.lawsuits.map((r) => listed(r));

    const summary = await ingestAndExtract({ now: NOW });

    expect(lawsuit('kia')?.status).toBe('closed');
    expect(db.updates.filter((u) => u.id === 'kia')).toEqual([{ id: 'kia', patch: { status: 'closed' } }]);
    expect(lawsuit('deere')?.status).toBe('open');
    expect(summary).toMatchObject({ closed: 1, closedByDeadline: 1, reopened: 1 });
  });
});

describe('closes and the circuit breaker read the official deadline', () => {
  it('a guided row whose feed deadline moves into the past is not a close', async () => {
    const pastFeedDeadline = plus(TODAY, -2);
    db.lawsuits = [row('deere', DEERE, plus(TODAY, 30)), ...plain(5, plus(TODAY, 90))];
    db.feed = [
      listed(db.lawsuits[0], { deadline: pastFeedDeadline }),
      // Five real closes: as many as a run may make here without a person.
      ...db.lawsuits.slice(1).map((r) => listed(r, { status: 'closed' })),
    ];

    const summary = await ingestAndExtract({ now: NOW });

    expect(summary).toMatchObject({ held: 0, closed: 5, deadlineChanges: 1 });
    expect(summary.heldClosures).toEqual([]);
    expect(summary.wouldClose.map((r) => r.slug)).not.toContain(DEERE);
    expect(lawsuit('deere')).toMatchObject({ status: 'open', deadline: pastFeedDeadline });
    for (const r of db.lawsuits.slice(1)) expect(r.status).toBe('closed');
  });

  it.each([
    { failOpenRead: false, rows: 'the open rows' },
    { failOpenRead: true, rows: 'the feed’s rows when the open rows cannot be read' },
  ])('a guided row open by its official deadline counts among $rows', async ({ failOpenRead }) => {
    db.failOpenRead = failOpenRead;
    vi.stubEnv('INGEST_MAX_CLOSE_SHARE', '0.5');
    db.lawsuits = [
      // The feed's deadlines have passed; the official ones are still ahead.
      row('deere', DEERE, plus(TODAY, -10)),
      row('realpage', REALPAGE, plus(TODAY, -10)),
      ...plain(10, plus(TODAY, 90)),
    ];
    // The feed closes six plain rows: 12 open rows x 0.5 allows 6, the 10 plain ones alone 5.
    db.feed = db.lawsuits.map((r, i) => listed(r, i >= 2 && i < 8 ? { status: 'closed' } : {}));

    const summary = await ingestAndExtract({ now: NOW });

    expect(summary).toMatchObject({ held: 0, closed: 6, failed: failOpenRead ? 1 : 0 });
    expect(db.lawsuits.filter((r) => r.status === 'closed').map((r) => r.id)).toEqual(
      db.lawsuits.slice(2, 8).map((r) => r.id),
    );
    expect(lawsuit('deere')?.status).toBe('open');
    expect(lawsuit('realpage')?.status).toBe('open');
  });
});
