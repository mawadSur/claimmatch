import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DATE_BOUNDED_FACTLESS_SCORE_CAP,
  STRONG_MATCH_SCORE_THRESHOLD,
  matchProfile,
  matchStrengthFromScore,
  scoreLawsuit,
} from '@/lib/matching';
import type { EligibilityCriteria } from '@/lib/types';
import { makeLawsuit, makeProfile } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * MATCH_SPECIFICITY_GATE_ENABLED (default on).
 *
 * Production symptom: a subscriber whose profile said only "yes, I have worked
 * an hourly or gig job in the last 4 years" was shown an HOURLY NON-EXEMPT
 * WORKER settlement at one named employer as a Strong match. The row carried
 * `eligibility.requires = ['employed_hourly']`, which scored
 * 0.5 + (1/1) * 0.5 = 1.0, while the employer, the role and the class period
 * in `tags` were only ever a bonus. These tests pin the gate that closes it.
 */

const NOW = new Date('2026-11-26T12:00:00Z');

const GIG_PROFILE = () =>
  makeProfile({ state: 'CA', attributes: { employed_hourly: true }, facts: [] });

const ACME_ELIGIBILITY: EligibilityCriteria = { states: ['CA'], requires: ['employed_hourly'] };

const ACME_OVERRIDES = {
  id: 'acme-wage',
  slug: 'acme-logistics-unpaid-overtime',
  category: 'Employment',
  title: 'Acme Logistics Unpaid Overtime Settlement',
  eligibility_text:
    'Hourly non-exempt employees of Acme Logistics who worked in California between January 1, 2019 and December 31, 2022.',
  deadline: '2099-01-01',
} as const;

const acmeLawsuit = (overrides: Record<string, unknown> = {}) =>
  makeLawsuit(
    { ...ACME_ELIGIBILITY },
    {
      ...ACME_OVERRIDES,
      tags: {
        employers: ['Acme Logistics'],
        class_period_start: '2019-01-01',
        class_period_end: '2022-12-31',
      },
      ...overrides,
    },
  );

describe('employer-bounded classes need a corroborating employer fact', () => {
  it('does not match a generic gig-worker profile to a company-specific hourly non-exempt wage settlement', () => {
    const result = scoreLawsuit(GIG_PROFILE(), acmeLawsuit(), NOW);
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons.join(' ')).not.toMatch(/Acme/i);
    expect(matchProfile(GIG_PROFILE(), [acmeLawsuit()], 0.4, NOW)).toHaveLength(0);
  });

  it('matches the same settlement for someone who worked there during the class period', () => {
    const profile = makeProfile({
      state: 'CA',
      attributes: { employed_hourly: true },
      facts: [
        { type: 'employer', value: 'Acme Logistics', start_date: '2020-01-01', end_date: '2021-12-31' },
      ],
    });
    const result = scoreLawsuit(profile, acmeLawsuit(), NOW);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.reasons).toContain('Worked at Acme Logistics during the class period');
    expect(matchProfile(profile, [acmeLawsuit()], 0.4, NOW)).toHaveLength(1);
  });

  it('does not match an employer fact dated outside the class period', () => {
    const profile = makeProfile({
      state: 'CA',
      attributes: { employed_hourly: true },
      facts: [
        { type: 'employer', value: 'Acme Logistics', start_date: '2015-01-01', end_date: '2015-12-31' },
      ],
    });
    const result = scoreLawsuit(profile, acmeLawsuit(), NOW);
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('reads the employer out of the listing text when tags were never recomputed', () => {
    // An eligibility draft approved after ingest writes `eligibility` only, so
    // the row can carry `requires` with a null `tags.employers`.
    const sparse = acmeLawsuit({ tags: null });
    const result = scoreLawsuit(GIG_PROFILE(), sparse, NOW);
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(matchProfile(GIG_PROFILE(), [sparse], 0.4, NOW)).toHaveLength(0);
  });

  it('keeps an employer-bounded row with no structured rules out of the keyword path', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const row = makeLawsuit(
      {},
      {
        id: 'acme-no-rules',
        slug: 'acme-logistics-overtime',
        category: 'Employment',
        title: 'Acme Logistics Overtime Settlement',
        eligibility_text: 'Hourly employees of Acme Logistics.',
        deadline: '2099-01-01',
      },
    );
    const result = scoreLawsuit(GIG_PROFILE(), row, NOW);
    // Before the gate this scored UNSTRUCTURED_BOTH_SCORE (0.45) and showed up
    // as a "Possible match"; now it never reaches the category/keyword path.
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(matchProfile(GIG_PROFILE(), [row], 0.4, NOW)).toHaveLength(0);
  });

  it('does not ban industry-wide wage settlements that name no employer', () => {
    const nationwide = makeLawsuit(
      { ...ACME_ELIGIBILITY },
      {
        id: 'nationwide-wage',
        slug: 'nationwide-hourly-wage',
        category: 'Employment',
        title: 'Nationwide Hourly Wage Settlement',
        eligibility_text: 'All current and former non-exempt employees nationwide.',
        deadline: '2099-01-01',
      },
    );
    const result = scoreLawsuit(GIG_PROFILE(), nationwide, NOW);
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
    expect(matchProfile(GIG_PROFILE(), [nationwide], 0.4, NOW)).toHaveLength(1);
  });

  it('restores the old 1.0 score when the kill switch is set', () => {
    vi.stubEnv('MATCH_SPECIFICITY_GATE_ENABLED', '0');
    const result = scoreLawsuit(GIG_PROFILE(), acmeLawsuit(), NOW);
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
    expect(matchStrengthFromScore(result.score)).toBe('strong');
  });
});

describe('fact-to-tag matching respects word boundaries and a minimum length', () => {
  const tagged = () =>
    makeLawsuit(
      {},
      {
        id: 'tagged',
        slug: 'acme-tagged',
        title: 'Test Settlement',
        tags: { employers: ['Acme Logistics, Inc.'] },
        deadline: '2099-01-01',
      },
    );

  it('still matches a company name against a longer legal name', () => {
    const profile = makeProfile({
      facts: [{ type: 'employer', value: 'Acme Logistics', start_date: null, end_date: null }],
    });
    const result = scoreLawsuit(profile, tagged(), NOW);
    expect(result.eligible).toBe(true);
    expect(result.reasons.join(' ')).toMatch(/Acme Logistics, Inc\./);
  });

  it('no longer lets a two-character fact match an unrelated employer tag', () => {
    const profile = makeProfile({
      facts: [{ type: 'employer', value: 'AC', start_date: null, end_date: null }],
    });
    const result = scoreLawsuit(profile, tagged(), NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).not.toMatch(/Acme/i);
  });
});

describe('date-bounded classes cannot read as a Strong match without dated facts', () => {
  const breach = (overrides: Record<string, unknown>) =>
    makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      {
        id: 'breach-dated',
        slug: 'retailer-data-breach',
        category: 'Data Breach',
        title: 'Retailer Data Breach Settlement',
        deadline: '2099-01-01',
        ...overrides,
      },
    );
  const profile = () => makeProfile({ state: 'CA', attributes: { had_data_breach: true } });

  it('caps a class-period-bounded row below the Strong threshold', () => {
    const result = scoreLawsuit(
      profile(),
      breach({ tags: { class_period_start: '2019-01-01', class_period_end: '2022-12-31' } }),
      NOW,
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(DATE_BOUNDED_FACTLESS_SCORE_CAP);
    expect(result.score).toBeLessThan(STRONG_MATCH_SCORE_THRESHOLD);
    expect(matchStrengthFromScore(result.score)).toBe('possible');
  });

  it('reads eligibility.dateRange, which the matcher never consulted before', () => {
    const row = makeLawsuit(
      {
        states: ['CA'],
        requires: ['had_data_breach'],
        dateRange: { from: '2019-01-01', to: '2022-12-31' },
      },
      {
        id: 'breach-range',
        slug: 'retailer-data-breach-range',
        category: 'Data Breach',
        title: 'Retailer Data Breach Settlement',
        deadline: '2099-01-01',
      },
    );
    expect(scoreLawsuit(profile(), row, NOW).score).toBe(DATE_BOUNDED_FACTLESS_SCORE_CAP);
  });

  it('does not cap an unbounded class, or one the profile can actually date', () => {
    expect(scoreLawsuit(profile(), breach({}), NOW).score).toBe(1);
    const dated = makeProfile({
      state: 'CA',
      attributes: { had_data_breach: true },
      facts: [{ type: 'account', value: 'Acme Retail', start_date: '2021-01-01', end_date: '2021-12-31' }],
    });
    const result = scoreLawsuit(
      dated,
      breach({
        tags: {
          brands: ['Acme Retail'],
          class_period_start: '2019-01-01',
          class_period_end: '2022-12-31',
        },
      }),
      NOW,
    );
    expect(result.score).toBe(1);
    expect(matchStrengthFromScore(result.score)).toBe('strong');
  });

  it('leaves the cap off when the kill switch is set', () => {
    vi.stubEnv('MATCH_SPECIFICITY_GATE_ENABLED', '0');
    const result = scoreLawsuit(
      profile(),
      breach({ tags: { class_period_start: '2019-01-01', class_period_end: '2022-12-31' } }),
      NOW,
    );
    expect(result.score).toBe(1);
  });
});
