import { describe, expect, it } from 'vitest';
import { CLAIMMATCH_MEMBERSHIP_PRICE_CENTS, DASHBOARD_VALUE_COPY } from '@/lib/copy';
import {
  ASSUMED_MINUTES_PER_CLAIM,
  buildDashboardValue,
  comparisonAssumption,
  countSubmittedClaims,
  estimatedTimeSaved,
  isSubmittedClaim,
  monthsSubscribed,
  sumReportedPayouts,
  valueComparison,
} from '@/lib/dashboard-value';
import { buildOwedEstimate } from '@/lib/owed-estimate';

const NOW = new Date('2026-11-27T12:00:00.000Z');

describe('countSubmittedClaims', () => {
  it('needs a confirmation number before a "submitted" row counts', () => {
    // The retired e-sign flow wrote bare 'submitted' rows although nothing was
    // filed (isLegacyClaim); counting them would overstate the panel.
    expect(isSubmittedClaim({ status: 'submitted' })).toBe(false);
    expect(isSubmittedClaim({ status: 'submitted', confirmation_number: '   ' })).toBe(false);
    expect(isSubmittedClaim({ status: 'submitted', confirmation_number: 'ABC-1' })).toBe(true);
  });

  it('counts reported_filed and filed_by_claimmatch', () => {
    expect(isSubmittedClaim({ status: 'reported_filed' })).toBe(true);
    // displayClaimStatus groups filed_by_claimmatch under 'in_process', so a
    // group-based tally would miss a claim Easy submit actually sent.
    expect(isSubmittedClaim({ status: 'filed_by_claimmatch' })).toBe(true);
  });

  it('counts nothing for a claim still waiting, in flight, or closed', () => {
    for (const status of [
      'self_file',
      'not_reported_filed',
      'withdrawn',
      'processing',
      'approved',
      'rejected',
      'paid',
      'preparing',
      'ready',
      'needs_you',
      'signed',
      'queued',
      'filing',
      'filing_rejected',
    ]) {
      expect(isSubmittedClaim({ status })).toBe(false);
    }
  });

  it('collapses a claim listed twice', () => {
    expect(
      countSubmittedClaims([
        { id: 'c1', status: 'reported_filed' },
        { id: 'c1', status: 'filed_by_claimmatch' },
        { id: 'c2', status: 'submitted', confirmation_number: 'X1' },
        { id: 'c3', status: 'self_file' },
      ]),
    ).toBe(2);
  });
});

describe('sumReportedPayouts', () => {
  it('keeps the count and the total as separate facts', () => {
    // gross_amount defaults to 0 when the member reports a payout with no
    // amount (payout-report.ts), so the count moves and the total does not.
    expect(sumReportedPayouts([{ gross_amount: 0 }])).toEqual({ count: 1, total: 0 });
    expect(sumReportedPayouts([{ gross_amount: 0 }, { gross_amount: 40 }])).toEqual({
      count: 2,
      total: 40,
    });
  });

  it('sums a numeric column returned as a string', () => {
    // PostgREST returns numeric as a string; finitePayoutAmount exists for it.
    expect(sumReportedPayouts([{ gross_amount: '125.50' }, { gross_amount: '74.50' }])).toEqual({
      count: 2,
      total: 200,
    });
  });

  it('ignores a negative, blank, or unparseable amount but still counts the row', () => {
    expect(
      sumReportedPayouts([
        { gross_amount: -10 },
        { gross_amount: null },
        { gross_amount: '' },
        { gross_amount: 'n/a' },
        { gross_amount: Number.NaN },
      ]),
    ).toEqual({ count: 5, total: 0 });
  });

  it('is zero for no rows', () => {
    expect(sumReportedPayouts([])).toEqual({ count: 0, total: 0 });
  });
});

describe('estimatedTimeSaved', () => {
  it('is null below one submitted claim', () => {
    expect(estimatedTimeSaved(0)).toBeNull();
    expect(estimatedTimeSaved(-3)).toBeNull();
    expect(estimatedTimeSaved(Number.NaN)).toBeNull();
  });

  it('is exactly the claim count times the assumed minutes', () => {
    expect(ASSUMED_MINUTES_PER_CLAIM).toBe(20);
    expect(estimatedTimeSaved(1)?.minutes).toBe(20);
    expect(estimatedTimeSaved(3)?.minutes).toBe(60);
    expect(estimatedTimeSaved(3, 10)?.minutes).toBe(30);
  });

  it('states the per-claim minutes figure, so the number is never shown unexplained', () => {
    const saved = estimatedTimeSaved(2);
    expect(saved?.label).toBe('40 minutes');
    expect(saved?.assumption).toContain('20 minutes per claim');
    expect(saved?.assumption).toContain(DASHBOARD_VALUE_COPY.estimateWord);
    expect(estimatedTimeSaved(6)?.label).toBe('2 hours');
    expect(estimatedTimeSaved(5)?.label).toBe('1.7 hours');
  });
});

describe('monthsSubscribed', () => {
  it('is null without a membership row or a usable stamp', () => {
    expect(monthsSubscribed(null, NOW)).toBeNull();
    expect(monthsSubscribed({}, NOW)).toBeNull();
    expect(monthsSubscribed({ createdAt: 'not a date' }, NOW)).toBeNull();
  });

  it('is zero inside the free trial', () => {
    expect(
      monthsSubscribed({ createdAt: '2026-11-24T00:00:00Z', trialEnd: '2026-12-01T00:00:00Z' }, NOW),
    ).toBe(0);
  });

  it('counts monthly periods begun once the trial has ended', () => {
    expect(monthsSubscribed({ trialEnd: '2026-11-20T00:00:00Z' }, NOW)).toBe(1);
    expect(monthsSubscribed({ trialEnd: '2026-09-20T00:00:00Z' }, NOW)).toBe(3);
    // Before the monthly anniversary the newest period has not begun: billing
    // started on the 28th, so on the 27th only two periods have.
    expect(monthsSubscribed({ trialEnd: '2026-09-28T00:00:00Z' }, NOW)).toBe(2);
  });

  it('falls back to created_at when there is no trial stamp', () => {
    expect(monthsSubscribed({ createdAt: '2026-08-27T00:00:00Z' }, NOW)).toBe(4);
  });
});

describe('valueComparison', () => {
  const potential = buildOwedEstimate([{ payoutMin: 200, payoutMax: 600 }]);

  it('has no basis when there is no membership start date', () => {
    const result = valueComparison({ actualTotal: 0, potential: null, months: null });
    expect(result.basis).toBeNull();
    expect(result.multipleLabel).toBeNull();
    expect(result.note).toBe(DASHBOARD_VALUE_COPY.comparisonNoStart);
  });

  it('has no basis during the trial, when nothing has been billed', () => {
    const result = valueComparison({ actualTotal: 500, potential, months: 0 });
    expect(result.basis).toBeNull();
    expect(result.note).toBe(DASHBOARD_VALUE_COPY.comparisonInTrial);
  });

  it('has no basis with no reported payout and no stated potential', () => {
    const result = valueComparison({ actualTotal: 0, potential: null, months: 2 });
    expect(result.basis).toBeNull();
    expect(result.note).toBe(DASHBOARD_VALUE_COPY.comparisonNothingToCompare);
  });

  it('prefers the amount the member reported receiving', () => {
    const result = valueComparison({ actualTotal: 100, potential, months: 1 });
    expect(result.basis).toBe('actual');
    // 100 / 19.99 ≈ 5.0
    expect(result.multipleLabel).toBe('5×');
    expect(result.costLabel).toBe('$20');
  });

  it('falls back to the listed potential range and says so', () => {
    const result = valueComparison({ actualTotal: 0, potential, months: 1 });
    expect(result.basis).toBe('potential');
    expect(result.multipleLabel).toBe('10×–30×');
  });

  it('names the monthly list price and never claims a billed amount', () => {
    const assumption = valueComparison({ actualTotal: 100, potential, months: 3 }).assumption;
    expect(assumption).toContain('$19.99 a month');
    expect(assumption).toContain('3 months subscribed');
    expect(assumption).toContain('monthly list price');
    expect(assumption).toContain('does not store your payment history');
    expect(assumption).not.toMatch(/you paid|you were billed|what you paid/i);
  });

  it('takes the price from CLAIMMATCH_MEMBERSHIP_PRICE_CENTS, not a hard-coded 19.99', () => {
    expect(CLAIMMATCH_MEMBERSHIP_PRICE_CENTS).toBe(1999);
    const cheaper = valueComparison({
      actualTotal: 100,
      potential: null,
      months: 1,
      monthlyCents: 1000,
    });
    expect(cheaper.multipleLabel).toBe('10×');
    expect(comparisonAssumption(1, 1000)).toContain('$10.00 a month');
  });
});

describe('buildDashboardValue', () => {
  const empty = {
    matches: [],
    claims: [],
    payouts: [],
    membership: null,
    now: NOW,
  } as const;

  it('is null when there is nothing on file', () => {
    expect(buildDashboardValue(empty)).toBeNull();
    // A match with no listed payout is still nothing to show.
    expect(
      buildDashboardValue({ ...empty, matches: [{ payoutMin: null, payoutMax: null }] }),
    ).toBeNull();
  });

  it('never turns a zero-amount payout report into a total', () => {
    const value = buildDashboardValue({ ...empty, payouts: [{ gross_amount: 0 }] });
    expect(value?.payouts).toEqual({ count: 1, total: 0 });
    expect(value?.payoutTotalLabel).toBeNull();
  });

  it('keeps potential and actual apart and never adds them together', () => {
    const value = buildDashboardValue({
      ...empty,
      matches: [{ payoutMin: 100, payoutMax: 300 }],
      payouts: [{ gross_amount: 50 }],
      claims: [{ id: 'c1', status: 'reported_filed' }],
      membership: { trialEnd: '2026-10-20T00:00:00Z' },
    });
    expect(value?.potential).toEqual({ statedCount: 1, unstatedCount: 0, low: 100, high: 300 });
    expect(value?.potentialLabel).toBe('$100–$300');
    expect(value?.payouts).toEqual({ count: 1, total: 50 });
    expect(value?.payoutTotalLabel).toBe('$50');
    expect(value?.submittedCount).toBe(1);
    expect(value?.timeSaved?.minutes).toBe(20);
    expect(value?.comparison.basis).toBe('actual');
  });

  it('shows no time-saved estimate when no claim has reached an administrator', () => {
    const value = buildDashboardValue({ ...empty, matches: [{ payoutMin: 10, payoutMax: 10 }] });
    expect(value?.submittedCount).toBe(0);
    expect(value?.timeSaved).toBeNull();
  });
});
