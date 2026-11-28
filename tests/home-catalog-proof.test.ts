import { describe, expect, it } from 'vitest';
import { catalogProofStats } from '@/components/home/HomeCatalogProof';
import type { HomeStats } from '@/lib/home-stats';
import type { PayoutStats } from '@/lib/payout-stats';

const home = (partial: Partial<HomeStats>): HomeStats => ({
  open: 0,
  closingSoon: 0,
  noProof: 0,
  updatedAt: null,
  ...partial,
});

const payout = (partial: Partial<PayoutStats>): PayoutStats => ({
  withStatedPayout: 0,
  medianPayout: null,
  topPayout: null,
  ...partial,
});

describe('catalogProofStats', () => {
  it('returns null for a failed or empty catalog', () => {
    expect(catalogProofStats(null, null)).toBeNull();
    expect(catalogProofStats(home({ open: 0 }), payout({ withStatedPayout: 0 }))).toBeNull();
  });

  it('passes through real open, closing-soon, and stated-payout counts', () => {
    expect(
      catalogProofStats(
        home({ open: 12, closingSoon: 3, updatedAt: '2026-11-20T00:00:00Z' }),
        payout({ withStatedPayout: 5 }),
      ),
    ).toEqual({
      open: 12,
      closingSoon: 3,
      withStatedPayout: 5,
      updatedAt: '2026-11-20T00:00:00Z',
    });
  });
});
