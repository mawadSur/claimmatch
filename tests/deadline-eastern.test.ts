import { describe, expect, it } from 'vitest';
import { planDeadlineCloses, type StaleCandidate } from '@/lib/scraper/stale';
import {
  daysUntil,
  isDeadlinePassed,
  todayInDeadlineZone,
} from '@/lib/utils';

/**
 * 2026-10-16T02:00:00Z is 10:00 pm EDT on Oct 15. UTC's calendar date is
 * already Oct 16, so a UTC-date filter would close a 2026-10-15 deadline
 * during the US evening. America/New_York still has Oct 15.
 */
const EVENING_UTC = new Date('2026-10-16T02:00:00Z');
const AFTER_MIDNIGHT_ET = new Date('2026-10-16T04:00:00Z');

function candidate(deadline: string): StaleCandidate {
  return {
    id: 'row-a',
    slug: 'acme-data-breach-settlement',
    status: 'open',
    deadline,
    review_status: 'published',
    source_id: null,
    external_id: null,
    last_seen_at: null,
    missed_feed_count: 0,
  };
}

describe('deadline filters use America/New_York, not UTC', () => {
  it('keeps a deadline open through that day in New York during the US evening', () => {
    expect(todayInDeadlineZone(EVENING_UTC)).toBe('2026-10-15');
    expect(EVENING_UTC.toISOString().slice(0, 10)).toBe('2026-10-16');
    expect(isDeadlinePassed('2026-10-15', EVENING_UTC)).toBe(false);
    expect(daysUntil('2026-10-15', EVENING_UTC)).toBe(0);
    expect(planDeadlineCloses([candidate('2026-10-15')], EVENING_UTC)).toHaveLength(0);
  });

  it('closes the deadline at midnight Eastern the next day', () => {
    expect(todayInDeadlineZone(AFTER_MIDNIGHT_ET)).toBe('2026-10-16');
    expect(isDeadlinePassed('2026-10-15', AFTER_MIDNIGHT_ET)).toBe(true);
    expect(planDeadlineCloses([candidate('2026-10-15')], AFTER_MIDNIGHT_ET)).toHaveLength(1);
  });
});
