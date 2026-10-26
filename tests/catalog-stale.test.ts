import { describe, expect, it } from 'vitest';
import {
  applyCloseBreaker,
  planIngest,
  type ExistingRow,
  type IngestPlan,
} from '@/lib/scraper/plan';
import {
  catalogOpenStatusCount,
  DEFAULT_MISSING_FEED_CLOSE_AFTER,
  formatDryRunReport,
  isFeedSourceRow,
  mergeStaleIntoPlan,
  missingFeedCloseAfterFromEnv,
  planDeadlineCloses,
  planFeedPresence,
  wouldCloseFromUpdate,
  type StaleCandidate,
} from '@/lib/scraper/stale';
import type { ScrapedLawsuit } from '@/lib/types';

const now = new Date('2026-10-16T10:00:00Z'); // past the Honolulu cutoff for 2026-10-15
const SOURCE = '11111111-1111-4111-8111-111111111111';

function candidate(overrides: Partial<StaleCandidate> = {}): StaleCandidate {
  return {
    id: 'row-a',
    slug: 'acme-data-breach-settlement',
    status: 'open',
    deadline: '2026-12-01',
    review_status: 'published',
    source_id: SOURCE,
    external_id: 'settlesignal:a',
    last_seen_at: '2026-10-10T00:00:00Z',
    missed_feed_count: 0,
    ...overrides,
  };
}

describe('deadline closes', () => {
  it('closes an open row whose deadline has already passed', () => {
    const actions = planDeadlineCloses([candidate({ deadline: '2026-10-15' })], now);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      slug: 'acme-data-breach-settlement',
      reason: 'deadline',
      close: true,
      patch: { status: 'closed' },
    });
  });

  it('keeps a row open through the Honolulu cutoff on its deadline day', () => {
    const stillOpen = new Date('2026-10-16T08:00:00Z');
    expect(planDeadlineCloses([candidate({ deadline: '2026-10-15' })], stillOpen)).toHaveLength(0);
  });

  it('does not close a row with no deadline, a future deadline, or a closed/draft status', () => {
    expect(planDeadlineCloses([candidate({ deadline: null })], now)).toHaveLength(0);
    expect(planDeadlineCloses([candidate({ deadline: '2026-12-01' })], now)).toHaveLength(0);
    expect(planDeadlineCloses([candidate({ deadline: '2026-10-01', status: 'closed' })], now)).toHaveLength(0);
    expect(planDeadlineCloses([candidate({ deadline: '2026-10-01', status: 'draft' })], now)).toHaveLength(0);
  });
});

describe('feed presence', () => {
  it('stamps last_seen_at and resets the miss count when the row is in the feed', () => {
    const { seen, missing } = planFeedPresence({
      sourceRows: [candidate({ missed_feed_count: 2 })],
      seenExternalIds: ['settlesignal:a'],
      now,
    });
    expect(missing).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].patch).toEqual({ last_seen_at: now.toISOString(), missed_feed_count: 0 });
    expect(seen[0].close).toBe(false);
  });

  it('increments the miss count without closing before N successful feeds', () => {
    const { missing } = planFeedPresence({
      sourceRows: [candidate({ missed_feed_count: 1 })],
      seenExternalIds: ['settlesignal:other'],
      now,
      closeAfter: 3,
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      close: false,
      missed_feed_count: 2,
      patch: { missed_feed_count: 2 },
    });
  });

  it('closes on the Nth consecutive successful-feed miss', () => {
    const { missing } = planFeedPresence({
      sourceRows: [candidate({ missed_feed_count: 2 })],
      seenExternalIds: ['settlesignal:other'],
      now,
      closeAfter: 3,
    });
    expect(missing[0]).toMatchObject({
      close: true,
      reason: 'missing_from_feed',
      missed_feed_count: 3,
      patch: { status: 'closed', missed_feed_count: 3 },
    });
  });

  it('never closes when the seen set is empty (failed or empty feed)', () => {
    const { seen, missing } = planFeedPresence({
      sourceRows: [candidate({ missed_feed_count: 2 }), candidate({ id: 'b', slug: 'b', external_id: 'settlesignal:b' })],
      seenExternalIds: [],
      now,
      closeAfter: 1,
    });
    expect(seen).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('ignores already-closed and draft rows', () => {
    const { seen, missing } = planFeedPresence({
      sourceRows: [
        candidate({ status: 'closed', missed_feed_count: 5 }),
        candidate({ id: 'd', slug: 'd', status: 'draft', external_id: 'settlesignal:d' }),
      ],
      seenExternalIds: ['settlesignal:other'],
      now,
      closeAfter: 1,
    });
    expect(seen).toHaveLength(0);
    expect(missing).toHaveLength(0);
  });

  it('treats a row as from the feed by source_id or external_id prefix', () => {
    expect(isFeedSourceRow({ source_id: SOURCE, external_id: null }, SOURCE, 'settlesignal')).toBe(true);
    expect(isFeedSourceRow({ source_id: null, external_id: 'settlesignal:a' }, SOURCE, 'settlesignal')).toBe(true);
    expect(isFeedSourceRow({ source_id: null, external_id: 'other:a' }, SOURCE, 'settlesignal')).toBe(false);
  });
});

describe('merge + dry-run report', () => {
  const emptyPlan = (): IngestPlan => ({ inserts: [], updates: [], flagged: [], skipped: 0 });

  it('lets a deadline close win over a miss increment on the same row', () => {
    const deadline = planDeadlineCloses([candidate({ deadline: '2026-10-01' })], now);
    const { missing } = planFeedPresence({
      sourceRows: [candidate({ deadline: '2026-10-01', missed_feed_count: 0 })],
      seenExternalIds: ['settlesignal:other'],
      now,
      closeAfter: 3,
    });
    const merged = mergeStaleIntoPlan(emptyPlan(), [...missing, ...deadline]);
    expect(merged.updates).toHaveLength(1);
    expect(merged.updates[0].closes).toBe(true);
    expect(merged.updates[0].closeReason).toBe('deadline');
    expect(merged.updates[0].patch.status).toBe('closed');
  });

  it('does not turn a seen stamp into a close', () => {
    const { seen } = planFeedPresence({
      sourceRows: [candidate()],
      seenExternalIds: ['settlesignal:a'],
      now,
    });
    const merged = mergeStaleIntoPlan(emptyPlan(), seen);
    expect(merged.updates[0].closes).toBe(false);
  });

  it('describes a dry run by reason, including miss increments that do not close yet', () => {
    const wouldClose = [
      wouldCloseFromUpdate(
        { id: '1', slug: 'past-deadline', patch: {}, changes: ['deadline 2026-01-01 has passed'], closes: true, reopens: false, deadlineChange: null, closeReason: 'deadline' },
      ),
      wouldCloseFromUpdate(
        { id: '2', slug: 'dropped', patch: {}, changes: ['missing from 3 consecutive successful feeds'], closes: true, reopens: false, deadlineChange: null, closeReason: 'missing_from_feed' },
      ),
    ];
    const report = formatDryRunReport({
      wouldClose,
      wouldIncrementMiss: [
        { id: '3', slug: 'almost', reason: 'missing_from_feed', deadline: null, missed_feed_count: 2, external_id: 'settlesignal:x', changes: ['missed_feed_count 1 -> 2'] },
      ],
      held: [],
      closeAfter: DEFAULT_MISSING_FEED_CLOSE_AFTER,
    });
    expect(report).toContain('would close 2 row(s)');
    expect(report).toContain('deadline (1):');
    expect(report).toContain('past-deadline');
    expect(report).toContain('missing_from_feed (1):');
    expect(report).toContain('dropped');
    expect(report).toContain('would increment missed_feed_count, not yet closing (1):');
    expect(report).toContain('almost');
  });

  it('reads INGEST_MISSING_FEED_CLOSE_AFTER safely', () => {
    expect(missingFeedCloseAfterFromEnv(undefined)).toBe(3);
    expect(missingFeedCloseAfterFromEnv('')).toBe(3);
    expect(missingFeedCloseAfterFromEnv('5')).toBe(5);
    expect(missingFeedCloseAfterFromEnv('1')).toBe(1);
    expect(missingFeedCloseAfterFromEnv('0')).toBe(3);
    expect(missingFeedCloseAfterFromEnv('99')).toBe(3);
    expect(missingFeedCloseAfterFromEnv('lots')).toBe(3);
  });
});

describe('catalog open-status count', () => {
  it('counts published open rows even when the deadline has passed', () => {
    const rows = [
      candidate({ id: 'a', deadline: '2026-10-01' }),
      candidate({ id: 'b', slug: 'b', deadline: '2026-12-01' }),
      candidate({ id: 'c', slug: 'c', review_status: 'pending_review' }),
      candidate({ id: 'd', slug: 'd', status: 'closed' }),
    ];
    expect(catalogOpenStatusCount(rows)).toBe(2);
  });
});

describe('circuit breaker still holds a large stale batch', () => {
  it('holds deadline closes that exceed the share', () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      candidate({ id: `r${i}`, slug: `s-${i}`, external_id: `settlesignal:${i}`, deadline: '2026-01-01' }),
    );
    const plan = mergeStaleIntoPlan(
      { inserts: [], updates: [], flagged: [], skipped: 0 },
      planDeadlineCloses(rows, now),
    );
    const { held, allowed } = applyCloseBreaker(plan, { openCount: 100, maxShare: 0.2 });
    expect(allowed).toBe(20);
    expect(held).toHaveLength(100);
  });
});

describe('feed-present planner still closes only on an explicit status', () => {
  it('does not close a published row that the feed simply omitted', () => {
    const existing: ExistingRow = {
      id: 'row-a',
      slug: 'acme-data-breach-settlement',
      external_id: 'settlesignal:a',
      status: 'open',
      deadline: '2026-12-01',
      review_status: 'published',
      reviewed_at: null,
      title: 'Acme',
      claim_url: null,
    };
    const other: ScrapedLawsuit = {
      external_id: 'settlesignal:other',
      title: 'Other Settlement',
      status: 'open',
    };
    const p = planIngest({ items: [other], existing: [existing], sourceId: SOURCE, now });
    expect(p.updates).toHaveLength(0);
  });
});
