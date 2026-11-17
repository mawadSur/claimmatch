import { describe, expect, it } from 'vitest';
import {
  buildOwedEstimate,
  finitePayoutAmount,
  formatOwedUsd,
  owedRangeLabel,
  statedPayoutRange,
  unstatedPayoutCopy,
  visibleOwedEstimate,
} from '@/lib/owed-estimate';

describe('stated payout range', () => {
  it('uses payout_min and payout_max from the settlement record only', () => {
    expect(statedPayoutRange({ payoutMin: 25, payoutMax: 75 })).toEqual({ low: 25, high: 75 });
    expect(statedPayoutRange({ payoutMin: 40, payoutMax: null })).toEqual({ low: 40, high: 40 });
    expect(statedPayoutRange({ payoutMin: null, payoutMax: 90 })).toEqual({ low: 90, high: 90 });
  });

  it('excludes settlements with no numeric payout, including typical_payout-only rows', () => {
    expect(statedPayoutRange({ payoutMin: null, payoutMax: null })).toBeNull();
    expect(statedPayoutRange({})).toBeNull();
    expect(statedPayoutRange({ payoutMin: 'Varies', payoutMax: undefined })).toBeNull();
    expect(finitePayoutAmount('')).toBeNull();
    expect(finitePayoutAmount('12.5')).toBe(12.5);
  });
});

describe('owed estimate sum', () => {
  it('sums low and high across open matches and counts exclusions', () => {
    const estimate = buildOwedEstimate([
      { payoutMin: 10, payoutMax: 30 },
      { payoutMin: 5, payoutMax: 5 },
      { payoutMin: null, payoutMax: null },
      { payoutMin: null, payoutMax: 20 },
    ]);
    expect(estimate).toEqual({
      statedCount: 3,
      unstatedCount: 1,
      low: 10 + 5 + 20,
      high: 30 + 5 + 20,
    });
  });

  it('hides the header when fewer than one match has a stated amount', () => {
    expect(visibleOwedEstimate([])).toBeNull();
    expect(visibleOwedEstimate([{ payoutMin: null, payoutMax: null }])).toBeNull();
    expect(visibleOwedEstimate([{ payoutMin: 'nope', payoutMax: undefined }])).toBeNull();
    expect(visibleOwedEstimate([{ payoutMin: 12, payoutMax: null }])).toEqual({
      statedCount: 1,
      unstatedCount: 0,
      low: 12,
      high: 12,
    });
  });

  it('counts every excluded match for the “no payout amount announced” line', () => {
    const estimate = buildOwedEstimate([
      { payoutMin: 1, payoutMax: 2 },
      { payoutMin: null, payoutMax: null },
      { payoutMin: null, payoutMax: null },
      { payoutMin: null, payoutMax: null },
    ]);
    expect(unstatedPayoutCopy(estimate.unstatedCount)).toBe('3 claims have no payout amount announced');
    expect(unstatedPayoutCopy(1)).toBe('1 claim has no payout amount announced');
    expect(unstatedPayoutCopy(0)).toBeNull();
  });

  it('labels the range as an estimate without inventing a single figure', () => {
    expect(formatOwedUsd(25.4)).toBe('$25');
    expect(owedRangeLabel({ statedCount: 2, unstatedCount: 0, low: 10, high: 40 })).toBe('$10–$40');
    expect(owedRangeLabel({ statedCount: 1, unstatedCount: 0, low: 50, high: 50 })).toBe('$50');
  });
});
