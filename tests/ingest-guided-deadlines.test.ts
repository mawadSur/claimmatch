import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The nightly ingest (ingestAndExtract) closes a guided settlement by its
// official deadline (src/lib/settlement-guides.ts), not the feed's: a closed
// row leaves the catalog and the claim flow refuses it. The real pipeline
// runs; Supabase, the feeds and the decision log are fake.

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  lawsuits: [] as Record<string, unknown>[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  decisions: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => {
  function lawsuits() {
    let statuses: unknown[] | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      in: (column: string, values: unknown[]) => {
        if (column === 'status') statuses = values;
        return q;
      },
      range: async (from: number, to: number) => ({
        data: db.lawsuits.filter((row) => !statuses || statuses.includes(row.status)).slice(from, to + 1),
        error: null,
      }),
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
  const client = {
    from: (table: string) => {
      if (table === 'lawsuits') return lawsuits();
      throw new Error(`the deadline pass reads no ${table}`);
    },
  };
  return {
    isSupabaseConfigured: () => true,
    createServiceClient: () => client,
    createPublicClient: () => client,
    createClient: async () => client,
  };
});

// No feed: deadline closes do not wait for one.
vi.mock('@/lib/scraper/sources', () => ({ getSourceAdapters: () => [] }));
vi.mock('@/lib/held-closures', () => ({
  recordHeldClosureDecision: async (input: { slug: string }) => {
    db.decisions.push(input.slug);
    return { ok: true };
  },
}));

import { addCalendarDays } from '@/lib/claim-deadlines';
import { ingestAndExtract } from '@/lib/scraper/pipeline';
import { getSettlementGuide } from '@/lib/settlement-guides';

const DEERE = 'john-deere-repair-services-antitrust-settlement';
const KIA = 'kia-optima-sportage-window-regulator-settlement';
const official = (slug: string) => getSettlementGuide(slug)?.deadline as string;
const plus = (date: string, days: number) => addCalendarDays(date, days) as string;
// Noon in New York the day after the Kia guide's deadline, before the Deere one.
const NOW = new Date(`${plus(official(KIA), 1)}T17:00:00Z`);

function row(id: string, slug: string, deadline: string): Row {
  return {
    id,
    slug,
    status: 'open',
    deadline,
    review_status: 'published',
    source_id: null,
    external_id: `settlesignal:${id}`,
    last_seen_at: null,
    missed_feed_count: 0,
  };
}

const status = (id: string) => db.lawsuits.find((l) => l.id === id)?.status;

beforeEach(() => {
  db.updates = [];
  db.decisions = [];
  vi.stubEnv('INGEST_DRY_RUN', '');
  vi.stubEnv('INGEST_MAX_CLOSE_SHARE', '');
  vi.stubEnv('HELD_AUTO_CLOSE_PAST_DEADLINE', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(official(KIA) < official(DEERE)).toBe(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the ingest’s deadline closes on guided settlements', () => {
  beforeEach(() => {
    db.lawsuits = [
      // The feed's deadline passed; the official one is still ahead.
      row('deere', DEERE, plus(official(KIA), -20)),
      // The official deadline passed; the feed's is still ahead.
      row('kia', KIA, plus(official(KIA), 60)),
      row('plain', 'plain-settlement', plus(official(KIA), -1)),
    ];
  });

  it('keeps one open while its official deadline is ahead, whatever the feed says', async () => {
    const summary = await ingestAndExtract({ now: NOW });
    expect(status('deere')).toBe('open');
    expect(db.updates.map((u) => u.id)).not.toContain('deere');
    expect(summary.wouldClose.map((r) => r.slug)).not.toContain(DEERE);
  });

  it('closes one whose official deadline has passed, whatever the feed says', async () => {
    const summary = await ingestAndExtract({ now: NOW });
    expect(status('kia')).toBe('closed');
    expect(db.updates).toContainEqual({ id: 'kia', patch: { status: 'closed' } });
    expect(summary.wouldClose.find((r) => r.slug === KIA)?.changes).toEqual([`official deadline ${official(KIA)} has passed`]);
    // A row without a guide still closes by its own deadline.
    expect(status('plain')).toBe('closed');
    expect(summary).toMatchObject({ closed: 2, closedByDeadline: 2, held: 0 });
  });
});

describe('held deadline closes (HELD_AUTO_CLOSE_PAST_DEADLINE)', () => {
  beforeEach(() => {
    db.lawsuits = [
      row('deere', DEERE, plus(official(KIA), -20)),
      row('kia', KIA, plus(official(KIA), 60)),
      // Six more past their deadline trip the circuit breaker (it allows 5).
      ...Array.from({ length: 6 }, (_, i) => row(`plain-${i}`, `plain-settlement-${i}`, plus(official(KIA), -1 - i))),
    ];
  });

  it('are held for a person while the flag is off', async () => {
    const summary = await ingestAndExtract({ now: NOW });
    expect(db.updates).toEqual([]);
    expect(summary.heldSlugs).toContain(KIA);
    expect(summary.heldSlugs).not.toContain(DEERE);
  });

  it('close by the official deadline when the flag is on, and a guided one still ahead stays open', async () => {
    vi.stubEnv('HELD_AUTO_CLOSE_PAST_DEADLINE', '1');
    const summary = await ingestAndExtract({ now: NOW });
    expect(status('kia')).toBe('closed');
    expect(status('deere')).toBe('open');
    expect(summary).toMatchObject({ held: 0, autoClosedPastDeadline: 7 });
    expect(db.decisions).toContain(KIA);
    expect(db.decisions).not.toContain(DEERE);
  });
});
