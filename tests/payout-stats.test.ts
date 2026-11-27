import { describe, expect, it } from 'vitest';
import { payoutStats } from '@/lib/payout-stats';
import {
  PER_PERSON_CEILING,
  perPersonPayout,
  pickTopPayouts,
  statedDollarPayout,
} from '@/lib/top-payouts';
import { catalogLawsuit } from './helpers';

// 10:00 in New York on Nov 1, 2026 (deadline days are counted in that zone).
const NOW = new Date('2026-11-01T15:00:00Z');

/** Payout prose copied verbatim from live listings on https://lawsuitai.org/lawsuits. */
const LIVE = {
  rentalFund:
    'A $359,925,000 settlement fund with certain landlords and property managers. ' +
    'The official site does not state a per-person amount. Payments will be made later; ' +
    'there are no payments now. You must submit a claim to be eligible for a payment from these settlements.',
  fairFund:
    'The Commission ordered a $175,000,000.00 civil money penalty and established a Fair Fund ' +
    'so the penalty could be distributed to harmed investors. The Fair Fund consists of that ' +
    '$175,000,000.00, held in a Commission-designated account at the U.S. Department of the Treasury.',
  bareFund: '$122,500 Settlement Fund',
  grossFund:
    'A $125,000.00 gross fund, payable over about two years, for class members, administration ' +
    'costs, Class Counsel expenses, and a service award.',
  serviceAward:
    'Equity has agreed to pay $1,000,000.00 into a settlement fund for payments to settlement ' +
    'class members and for court-approved attorneys’ fees and costs, a $15,000.00 service award ' +
    'to the plaintiff, and administration costs.',
  halfDollar:
    'From a $9,000,000 settlement fund: $0.50 per covered product, up to 5 products ($2.50) ' +
    'without proof of purchase, and up to 20 more products with a third-party retail receipt. ' +
    'Those can be combined, up to $12.50 before any pro-rata change.',
  perEligiblePerson:
    'AdaptHealth has agreed to pay a Settlement Amount of $14,311,500. A $1,624,000 fund for ' +
    'Settlement Class A pays $3,500.00 per eligible person who submits a valid claim. A $6,700,000 ' +
    'fund for Settlement Class C pays $47.00 automatically to eligible people.',
  equalShare:
    'A $644,105.00 Settlement Fund. Each Settlement Class Member who submits a timely Claim Form ' +
    'that is deemed valid receives an equal payment. The official FAQ estimates a net per-person ' +
    'payment of about $950.00–$2,800.00, depending on how many valid claims are filed.',
  noAmount:
    'The official site says you may be entitled to benefits and a cash payment if you submit a ' +
    'valid and timely claim form. The homepage does not state a fixed per-person amount. ' +
    'Check the official notice for the payment rules.',
  varies: 'Varies',
} as const;

describe('statedDollarPayout: a fund total is never a per-person payout', () => {
  it('reads no payout from a fund total written in digits', () => {
    // The bug this pins: only "$5 million" was skipped, so these ranked at the
    // top of the home page's biggest-payout module while their own cards said
    // no per-person amount exists.
    expect(statedDollarPayout('$359,925,000 settlement fund')).toBeNull();
    expect(statedDollarPayout('$175,000,000')).toBeNull();
    expect(statedDollarPayout(LIVE.rentalFund)).toBeNull();
    expect(statedDollarPayout(LIVE.fairFund)).toBeNull();
  });

  it('reads no payout from a fund that sits below the plausibility ceiling', () => {
    expect(statedDollarPayout(LIVE.bareFund)).toBeNull();
    expect(statedDollarPayout(LIVE.grossFund)).toBeNull();
    expect(statedDollarPayout('A pro rata share of a $4,500,000 fund')).toBeNull();
    expect(statedDollarPayout('Pro rata share from three $500,000 pools')).toBeNull();
    expect(statedDollarPayout('Pro rata share of $150,000 Qualified Settlement Fund')).toBeNull();
  });

  it('reads no payout from a service award to the named plaintiff', () => {
    expect(statedDollarPayout(LIVE.serviceAward)).toBeNull();
  });

  it('reads the per-person figure stated beside a fund total', () => {
    expect(statedDollarPayout('$5,000 per class member')).toBe(5000);
    expect(statedDollarPayout(LIVE.perEligiblePerson)).toBe(3500);
    expect(statedDollarPayout(LIVE.equalShare)).toBe(2800);
    expect(statedDollarPayout('A $1,800,000 fund covering a $250 California statutory payment')).toBe(250);
  });

  it('keeps tiny real payouts, which are figures and not noise', () => {
    expect(statedDollarPayout('$0.50')).toBe(0.5);
    expect(statedDollarPayout(LIVE.halfDollar)).toBe(12.5);
    expect(statedDollarPayout('$8 per participating class member')).toBe(8);
  });

  it('reads nothing from text that states no amount', () => {
    expect(statedDollarPayout(LIVE.noAmount)).toBeNull();
    expect(statedDollarPayout(LIVE.varies)).toBeNull();
    expect(statedDollarPayout('')).toBeNull();
    expect(statedDollarPayout(null)).toBeNull();
    expect(statedDollarPayout(undefined)).toBeNull();
  });

  it('rejects an amount at the ceiling and keeps the one below it', () => {
    expect(statedDollarPayout(`$${PER_PERSON_CEILING} per person`)).toBeNull();
    expect(statedDollarPayout(`$${PER_PERSON_CEILING - 1} per person`)).toBe(PER_PERSON_CEILING - 1);
  });
});

describe('perPersonPayout', () => {
  it('prefers the curated per-person column over a read of the prose', () => {
    expect(perPersonPayout({ typical_payout: '$100 per person', payout_max: 250 })).toBe(250);
    expect(perPersonPayout({ typical_payout: LIVE.noAmount, payout_min: 40 })).toBe(40);
  });

  it('falls back to the prose when the columns hold no plausible figure', () => {
    expect(perPersonPayout({ typical_payout: '$100 per person', payout_max: null })).toBe(100);
    // A column holding a fund total is thrown out by the same ceiling.
    expect(perPersonPayout({ typical_payout: '$100 per person', payout_max: 359_925_000 })).toBe(100);
    expect(perPersonPayout({ typical_payout: LIVE.noAmount, payout_max: 0 })).toBeNull();
    expect(perPersonPayout({})).toBeNull();
  });
});

describe('pickTopPayouts', () => {
  const row = (id: string, typical_payout: string | null) =>
    catalogLawsuit({
      id,
      slug: `s-${id}`,
      title: `Settlement ${id}`,
      typical_payout,
      deadline: '2027-01-01',
    });

  it('returns nothing rather than ranking fund totals when no row states a payout', () => {
    const rows = [
      row('a', LIVE.rentalFund),
      row('b', LIVE.fairFund),
      row('c', LIVE.noAmount),
      row('d', LIVE.varies),
      row('e', null),
    ];
    expect(pickTopPayouts(rows)).toEqual([]);
  });

  it('ranks the genuine per-person figures and drops the fund-only rows', () => {
    const rows = [
      row('fund', LIVE.rentalFund),
      row('small', LIVE.halfDollar),
      row('mid', LIVE.equalShare),
      row('big', LIVE.perEligiblePerson),
    ];
    expect(pickTopPayouts(rows).map((r) => r.id)).toEqual(['big', 'mid', 'small']);
  });

  it('never ranks a row whose card would show no amount, however the columns read', () => {
    const rows = [
      row('stated', '$100 per person'),
      catalogLawsuit({
        id: 'column-only',
        slug: 's-column-only',
        title: 'Column only',
        typical_payout: null,
        payout_max: 9000,
      }),
    ];
    expect(pickTopPayouts(rows).map((r) => r.id)).toEqual(['stated']);
  });
});

describe('payoutStats', () => {
  /** A spread like the live catalog: mostly sub-$100, a few at $5,000, one above. */
  const DISTRIBUTION = [
    0.5, 8, 10, 16, 20, 47, 50, 75, 99, 100, 250, 350, 474, 964.48, 1000, 2800, 3500, 5000, 5000,
    15000,
  ];

  const rows = [
    ...DISTRIBUTION.map((amount, i) =>
      catalogLawsuit({
        id: `p-${i}`,
        slug: `stated-${i}`,
        title: `Stated ${i}`,
        typical_payout: `$${amount} per eligible person`,
        deadline: '2027-06-01',
      }),
    ),
    catalogLawsuit({
      id: 'f-1',
      slug: 'fund-1',
      title: 'Fund 1',
      typical_payout: LIVE.rentalFund,
      deadline: '2026-11-20',
    }),
    catalogLawsuit({
      id: 'f-2',
      slug: 'fund-2',
      title: 'Fund 2',
      typical_payout: LIVE.noAmount,
      deadline: null,
    }),
  ];

  it('counts the open rows, the ones that state a payout, and the median and maximum', () => {
    const stats = payoutStats(rows, NOW);
    expect(stats.open).toBe(22);
    expect(stats.withStatedPayout).toBe(20);
    expect(stats.medianPayout).toBe(100);
    expect(stats.topPayout).toEqual({ amount: 15000, slug: 'stated-19', title: 'Stated 19' });
  });

  it('counts only deadlines inside the closing-soon window', () => {
    expect(payoutStats(rows, NOW).closingSoon).toBe(1);
    expect(payoutStats(rows, NOW, 365).closingSoon).toBe(21);
  });

  it('returns nulls, not zeros, when no row states a payout', () => {
    const fundsOnly = [
      catalogLawsuit({ slug: 'fund-a', typical_payout: LIVE.rentalFund }),
      catalogLawsuit({ slug: 'fund-b', typical_payout: LIVE.bareFund }),
    ];
    const stats = payoutStats(fundsOnly, NOW);
    expect(stats.open).toBe(2);
    expect(stats.withStatedPayout).toBe(0);
    expect(stats.medianPayout).toBeNull();
    expect(stats.topPayout).toBeNull();
  });

  it('reports nothing at all for an empty catalog', () => {
    expect(payoutStats([], NOW)).toEqual({
      open: 0,
      withStatedPayout: 0,
      medianPayout: null,
      topPayout: null,
      closingSoon: 0,
    });
  });

  it('takes the median from a single stated listing', () => {
    const one = [catalogLawsuit({ slug: 'only', title: 'Only', typical_payout: '$99 per person' })];
    const stats = payoutStats(one, NOW);
    expect(stats.medianPayout).toBe(99);
    expect(stats.topPayout).toEqual({ amount: 99, slug: 'only', title: 'Only' });
  });
});
