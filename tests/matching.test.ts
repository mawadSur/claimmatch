import { describe, expect, it } from 'vitest';
import { matchProfile, scoreLawsuit } from '@/lib/matching';
import { makeLawsuit, makeProfile } from './helpers';

describe('scoreLawsuit — no structured criteria', () => {
  it('treats an empty eligibility object as a broad, low-confidence match', () => {
    const result = scoreLawsuit(makeProfile(), makeLawsuit({}));
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(0.35);
    expect(result.reasons).toContain('Open nationwide');
    expect(result.lawsuit_id).toBe('lawsuit-1');
  });
});

describe('scoreLawsuit — state hard-gate', () => {
  it('matches when the user lives in a listed state and scores 1.0', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA' }),
      makeLawsuit({ states: ['CA', 'NY'] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reasons).toContain('Available in your state (CA)');
  });

  it('hard-fails when the user lives outside the listed states', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'TX' }),
      makeLawsuit({ states: ['CA', 'NY'] }),
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('hard-fails a state-restricted lawsuit when the user has no state', () => {
    const result = scoreLawsuit(
      makeProfile({ state: null }),
      makeLawsuit({ states: ['CA'] }),
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('treats an empty states array as nationwide (no gate)', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'TX' }),
      makeLawsuit({ states: [] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain('Open nationwide');
  });
});

describe('scoreLawsuit — required attributes', () => {
  it('matches when every required attribute is truthy', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { had_data_breach: true } }),
      makeLawsuit({ requires: ['had_data_breach'] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reasons).toContain('Your data may have been exposed in a breach');
  });

  it('hard-fails when a required attribute is missing or falsy', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { had_data_breach: false } }),
      makeLawsuit({ requires: ['had_data_breach'] }),
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('hard-fails when only some of multiple requirements are met', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { had_data_breach: true } }),
      makeLawsuit({ requires: ['had_data_breach', 'owns_vehicle'] }),
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('accepts common truthy encodings ("true", "yes", 1, non-empty array)', () => {
    for (const value of ['true', 'yes', 1, ['Toyota']]) {
      const result = scoreLawsuit(
        makeProfile({ attributes: { owns_vehicle: value } }),
        makeLawsuit({ requires: ['owns_vehicle'] }),
      );
      expect(result.eligible).toBe(true);
    }
  });

  it('treats an empty array and "no" as falsy for a requirement', () => {
    for (const value of [[], 'no', 0, undefined]) {
      const result = scoreLawsuit(
        makeProfile({ attributes: { owns_vehicle: value } }),
        makeLawsuit({ requires: ['owns_vehicle'] }),
      );
      expect(result.eligible).toBe(false);
    }
  });
});

describe('scoreLawsuit — anyOf soft signals', () => {
  it('adds a soft signal when an attribute value overlaps the allowed set', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA', attributes: { vehicle_brands: ['Toyota', 'Honda'] } }),
      makeLawsuit({ states: ['CA'], anyOf: { vehicle_brands: ['Toyota'] } }),
    );
    // state hit + anyOf hit → 2 of 2 signals → score 1.0
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
  });

  it('does not hard-fail when an anyOf attribute does not overlap', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA', attributes: { vehicle_brands: ['Ford'] } }),
      makeLawsuit({ states: ['CA'], anyOf: { vehicle_brands: ['Toyota'] } }),
    );
    // state hit (1) counts, anyOf miss adds a signal but no hit → 1 of 2 → 0.75
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(0.75);
  });

  it('is not eligible when the only signal is a missed anyOf (no positive hits)', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { vehicle_brands: ['Ford'] } }),
      makeLawsuit({ anyOf: { vehicle_brands: ['Toyota'] } }),
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('matches a scalar (non-array) attribute value against the allowed set', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { uses_social_media: true } }),
      makeLawsuit({ anyOf: { uses_social_media: [true] } }),
    );
    expect(result.eligible).toBe(true);
  });
});

describe('scoreLawsuit — score shape', () => {
  it('rounds the score to two decimals (1 hit of 3 signals → 0.67)', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA', attributes: {} }),
      makeLawsuit({
        states: ['CA'],
        anyOf: { vehicle_brands: ['Toyota'], uses_social_media: [true] },
      }),
    );
    // 1 hit (state) of 3 signals → 0.5 + (1/3)*0.5 = 0.6667 → 0.67
    expect(result.score).toBe(0.67);
  });
});

describe('matchProfile', () => {
  it('returns only eligible lawsuits above the threshold, best score first', () => {
    const profile = makeProfile({ state: 'CA', attributes: { had_data_breach: true } });
    const strongMatch = makeLawsuit({ states: ['CA'], requires: ['had_data_breach'] }, {
      id: 'strong',
    });
    const weakMatch = makeLawsuit(
      { states: ['CA'], anyOf: { vehicle_brands: ['Toyota'] } },
      { id: 'weak' },
    );
    const outOfState = makeLawsuit({ states: ['NY'] }, { id: 'out' });

    const results = matchProfile(profile, [weakMatch, strongMatch, outOfState]);

    expect(results.map((r) => r.lawsuit_id)).toEqual(['strong', 'weak']);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results.every((r) => r.eligible)).toBe(true);
  });

  it('drops eligible matches whose score is below the given threshold', () => {
    const profile = makeProfile({ state: 'CA' });
    // state hit + one missed anyOf → score 0.75; a threshold above it excludes it.
    const lawsuit = makeLawsuit({ states: ['CA'], anyOf: { vehicle_brands: ['Toyota'] } });
    expect(matchProfile(profile, [lawsuit], 0.8)).toHaveLength(0);
    expect(matchProfile(profile, [lawsuit], 0.7)).toHaveLength(1);
  });
});
