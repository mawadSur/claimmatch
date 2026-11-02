import { describe, expect, it } from 'vitest';
import { formatCount, formatUpdated, homeStats } from '@/lib/home-stats';
import { makeLawsuit } from './helpers';

// 10:00 in New York on Nov 1, 2026 (deadline days are counted in that zone).
const NOW = new Date('2026-11-01T15:00:00Z');

describe('homeStats', () => {
  it('counts open, closing-soon and no-proof listings from the rows it is given', () => {
    const rows = [
      makeLawsuit({ proof: 'no' }, { deadline: '2026-11-20', last_seen_at: '2026-11-01T06:00:00Z' }),
      makeLawsuit({ proof: 'yes' }, { deadline: '2026-11-25', last_seen_at: '2026-10-31T06:00:00Z' }),
      makeLawsuit({ proof: 'unknown' }, { deadline: '2026-12-20' }),
      makeLawsuit({}, { deadline: null }),
    ];
    const stats = homeStats(rows, NOW);
    expect(stats.open).toBe(4);
    expect(stats.closingSoon).toBe(2);
    expect(stats.noProof).toBe(1);
    expect(stats.updatedAt).toBe('2026-11-01T06:00:00.000Z');
  });

  it('never counts a deadline past the window or one that already passed', () => {
    const rows = [
      makeLawsuit({}, { deadline: '2026-12-20' }),
      makeLawsuit({}, { deadline: '2026-10-15' }),
    ];
    expect(homeStats(rows, NOW).closingSoon).toBe(0);
  });

  it('ignores a last_seen_at stamp from the future', () => {
    const rows = [makeLawsuit({}, { last_seen_at: '2026-11-05T00:00:00Z' })];
    expect(homeStats(rows, NOW).updatedAt).toBeNull();
  });

  it('reports zeros for an empty catalog instead of inventing numbers', () => {
    expect(homeStats([], NOW)).toEqual({ open: 0, closingSoon: 0, noProof: 0, updatedAt: null });
  });
});

describe('home stat formatting', () => {
  it('formats whole counts', () => {
    expect(formatCount(359)).toBe('359');
    expect(formatCount(1204)).toBe('1,204');
    expect(formatCount(-3)).toBe('0');
  });

  it('formats the refresh date in New York time, or nothing', () => {
    expect(formatUpdated('2026-11-01T06:00:00Z')).toBe('Nov 1');
    // 02:00 UTC on Nov 2 is still Nov 1 in New York.
    expect(formatUpdated('2026-11-02T02:00:00Z')).toBe('Nov 1');
    expect(formatUpdated(null)).toBeNull();
    expect(formatUpdated('not a date')).toBeNull();
  });
});
