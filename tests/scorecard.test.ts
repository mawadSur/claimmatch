import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SCORECARD_MIN_POINTS,
  buildScorecard,
  countExcludingInternal,
  scorecardAmountStat,
  scorecardStat,
  sumPayoutsExcludingInternal,
} from '@/lib/scorecard';

describe('scorecard thresholding', () => {
  it('hides a count until there are at least 5 data points', () => {
    expect(SCORECARD_MIN_POINTS).toBe(5);
    expect(scorecardStat(0)).toEqual({ ready: false, count: 0, display: null });
    expect(scorecardStat(4)).toEqual({ ready: false, count: 0, display: null });
    expect(scorecardStat(5)).toEqual({ ready: true, count: 5, display: '5' });
    expect(scorecardStat(12)).toEqual({ ready: true, count: 12, display: '12' });
  });

  it('hides the payout total until there are at least 5 payout rows', () => {
    expect(scorecardAmountStat(4, 99_000)).toEqual({ ready: false, count: 0, display: null });
    expect(scorecardAmountStat(5, 1250)).toEqual({ ready: true, count: 5, display: '$1,250' });
  });

  it('never shows example numbers in the empty state', () => {
    const page = readFileSync(fileURLToPath(new URL('../src/app/scorecard/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('SCORECARD_EMPTY_COPY');
    expect(page).not.toMatch(/e\.g\.|for example|sample|dummy|placeholder number/i);
    expect(page).not.toContain('1,234');
    expect(page).not.toContain('$12,345');
    expect(page).toContain('flags.trustScorecard()');
    expect(page).toContain('notFound()');
  });
});

describe('scorecard internal exclusion', () => {
  const internal = new Set(['internal-1', 'internal-2']);

  it('does not count claims or payouts from is_internal users', () => {
    const claims = [
      { user_id: 'u1' },
      { user_id: 'internal-1' },
      { user_id: 'u2' },
      { user_id: 'internal-2' },
      { user_id: 'u3' },
    ];
    expect(countExcludingInternal(claims, internal)).toBe(3);

    const payouts = [
      { user_id: 'u1', gross_amount: 100 },
      { user_id: 'internal-1', gross_amount: 9_999 },
      { user_id: 'u2', gross_amount: 50 },
      { user_id: 'internal-2', gross_amount: 1 },
    ];
    expect(sumPayoutsExcludingInternal(payouts, internal)).toEqual({ count: 2, total: 150 });
  });

  it('treats a missing user id as excluded', () => {
    expect(countExcludingInternal([{ user_id: null }, {}], internal)).toBe(0);
  });

  it('builds independent stats so one thin column stays empty', () => {
    const stats = buildScorecard({
      openSettlementCount: 12,
      filedClaimCount: 2,
      payoutCount: 5,
      payoutTotalAmount: 800,
    });
    expect(stats.openSettlements.ready).toBe(true);
    expect(stats.claimsFiled.ready).toBe(false);
    expect(stats.payoutsReported.display).toBe('5');
    expect(stats.payoutTotal.display).toBe('$800');
  });
});
