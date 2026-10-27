import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STATE_ONLY_SCORE_CAP,
  UNSTRUCTURED_BOTH_SCORE,
  UNSTRUCTURED_CATEGORY_SCORE,
  UNSTRUCTURED_KEYWORD_SCORE,
  UNSTRUCTURED_NONE_SCORE,
  classifyMatch,
  matchProfile,
  matchStrengthLabel,
  scoreLawsuit,
} from '@/lib/matching';
import { makeLawsuit, makeProfile } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

// These tests pin the rule-based scorer in src/lib/matching.ts as it works
// today. They do not describe the product we want: until Phase 1 (D50) no
// match list, match email or percentage score is shown to anyone, and Phase 1
// replaces this scorer with a tri-state engine in which a state match alone
// never qualifies. That change rewrites these assertions (plan S6-2).

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
  it('matches a user in a listed state (and today scores a state-only match 1.0)', () => {
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
      expect(result.eligible, `value ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('treats an empty array, "no", 0 and a missing answer as falsy', () => {
    for (const value of [[], 'no', 0, undefined]) {
      const result = scoreLawsuit(
        makeProfile({ attributes: { owns_vehicle: value } }),
        makeLawsuit({ requires: ['owns_vehicle'] }),
      );
      expect(result.eligible, `value ${JSON.stringify(value)}`).toBe(false);
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
    // state hit counts; the anyOf miss adds a signal but no hit → 1 of 2 → 0.75
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
    // 1 hit (state) of 3 signals → 0.5 + (1/3) * 0.5 = 0.6667 → 0.67
    expect(result.score).toBe(0.67);
  });
});

describe('matchProfile', () => {
  it('returns only eligible lawsuits above the threshold, best score first', () => {
    const profile = makeProfile({ state: 'CA', attributes: { had_data_breach: true } });
    const strongMatch = makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      { id: 'strong' },
    );
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

  it('drops an empty profile because unstructured rows score below the default threshold', () => {
    const results = matchProfile(makeProfile(), [
      makeLawsuit({}, { id: 'no-rules' }),
      makeLawsuit({ states: ['CA'] }, { id: 'state-only' }),
    ]);
    expect(results).toEqual([]);
  });
});

describe('scoreLawsuit — past deadline', () => {
  const now = new Date('2026-10-27T12:00:00Z');

  it('never matches a settlement whose deadline has passed, even with a perfect rule hit', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA', attributes: { had_data_breach: true } }),
      makeLawsuit(
        { states: ['CA'], requires: ['had_data_breach'] },
        { deadline: '2026-10-15' },
      ),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it('still matches a future or missing deadline', () => {
    const profile = makeProfile({ attributes: { had_data_breach: true } });
    expect(
      scoreLawsuit(profile, makeLawsuit({ requires: ['had_data_breach'] }, { deadline: null }), now)
        .eligible,
    ).toBe(true);
    expect(
      scoreLawsuit(
        profile,
        makeLawsuit({ requires: ['had_data_breach'] }, { deadline: '2026-12-01' }),
        now,
      ).eligible,
    ).toBe(true);
  });
});

describe('matchProfile — past deadline', () => {
  const now = new Date('2026-10-27T12:00:00Z');

  it('skips past-deadline rows even when the caller forgot to filter the catalog', () => {
    const profile = makeProfile({ attributes: { had_data_breach: true } });
    const open = makeLawsuit({ requires: ['had_data_breach'] }, { id: 'open', deadline: '2026-12-01' });
    const expired = makeLawsuit(
      { requires: ['had_data_breach'] },
      { id: 'expired', deadline: '2026-10-15' },
    );
    expect(matchProfile(profile, [open, expired], 0.4, now).map((r) => r.lawsuit_id)).toEqual([
      'open',
    ]);
  });
});

describe('scoreLawsuit — state-only cap (flagged)', () => {
  it('keeps a state-only match at 1.0 when the cap flag is off', () => {
    const result = scoreLawsuit(
      makeProfile({ state: 'CA' }),
      makeLawsuit({ states: ['CA'] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(1);
  });

  it('caps a state-only match so it is not a strong match', () => {
    vi.stubEnv('MATCH_STATE_ONLY_CAP_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ state: 'CA' }),
      makeLawsuit({ states: ['CA', 'NY'] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(STATE_ONLY_SCORE_CAP);
    expect(result.score).toBeLessThan(0.75);
  });

  it('does not cap a state match that also has an attribute rule', () => {
    vi.stubEnv('MATCH_STATE_ONLY_CAP_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ state: 'CA', attributes: { had_data_breach: true } }),
      makeLawsuit({ states: ['CA'], requires: ['had_data_breach'] }),
    );
    expect(result.score).toBe(1);
  });
});

describe('scoreLawsuit — unstructured category/keyword (flagged)', () => {
  it('keeps the 0.35 placeholder when the unstructured flag is off', () => {
    const result = scoreLawsuit(
      makeProfile({ attributes: { had_data_breach: true } }),
      makeLawsuit({}, { category: 'Data Breach', title: 'Retailer Data Breach Settlement' }),
    );
    expect(result.score).toBe(UNSTRUCTURED_NONE_SCORE);
    expect(result.eligible).toBe(true);
  });

  it('matches a no-rule Data Breach row to a breach attribute, below rule-verified scores', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ attributes: { had_data_breach: true } }),
      makeLawsuit(
        {},
        {
          category: 'Data Breach',
          title: 'Retailer Data Breach Settlement',
          summary: 'A retailer exposed customer emails.',
        },
      ),
    );
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(UNSTRUCTURED_BOTH_SCORE);
    expect(result.score).toBeLessThan(0.5);
    expect(result.reasons).toContain('Related to Data Breach');
    expect(result.reasons).toContain('May relate to your profile');
    expect(result.reasons.join(' ')).not.toMatch(/medic/i);
  });

  it('scores a category-only overlap below a category+keyword overlap', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ attributes: { used_banking: true } }),
      makeLawsuit({}, { category: 'Financial & Banking', title: 'Merchant Cash Advance Settlement' }),
    );
    expect(result.score).toBe(UNSTRUCTURED_CATEGORY_SCORE);
    expect(result.reasons).toContain('Related to Financial & Banking');
  });

  it('scores a keyword-only overlap at the default threshold', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ attributes: { owns_vehicle: true, vehicle_brands: ['Toyota'] } }),
      makeLawsuit({}, { category: 'General', title: 'Toyota Brake Settlement' }),
    );
    expect(result.score).toBe(UNSTRUCTURED_KEYWORD_SCORE);
    expect(result.reasons).toContain('May relate to your profile');
  });

  it('does not raise the score for an empty profile even when the flag is on', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile(),
      makeLawsuit({}, { category: 'Data Breach', title: 'Retailer Data Breach Settlement' }),
    );
    expect(result.score).toBe(UNSTRUCTURED_NONE_SCORE);
  });

  it('never uses a leftover medication answer as a keyword or category hit', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    const result = scoreLawsuit(
      makeProfile({ attributes: { took_medication: true } }),
      makeLawsuit(
        {},
        { category: 'Health & Pharma', title: 'Prescription Device Settlement' },
      ),
    );
    expect(result.score).toBe(UNSTRUCTURED_NONE_SCORE);
    expect(result.reasons.join(' ')).not.toMatch(/medic/i);
  });
});

describe('matchProfile — ranking with both match flags on', () => {
  it('ranks rule-verified matches above a capped state-only hit, then heuristics', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    vi.stubEnv('MATCH_STATE_ONLY_CAP_ENABLED', '1');
    const profile = makeProfile({
      state: 'CA',
      attributes: { had_data_breach: true },
    });
    const rule = makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      { id: 'rule' },
    );
    const stateOnly = makeLawsuit({ states: ['CA'] }, { id: 'state' });
    const heuristic = makeLawsuit(
      {},
      { id: 'soft', category: 'Data Breach', title: 'Retailer Data Breach Settlement' },
    );
    const ids = matchProfile(profile, [heuristic, stateOnly, rule]).map((r) => r.lawsuit_id);
    expect(ids).toEqual(['rule', 'state', 'soft']);
    const [ruleHit, stateHit, softHit] = matchProfile(profile, [heuristic, stateOnly, rule]);
    expect(ruleHit.score).toBeGreaterThan(stateHit.score);
    expect(stateHit.score).toBeGreaterThan(softHit.score);
    expect(softHit.score).toBeLessThan(0.5);
  });
});

describe('sample profiles — before/after match counts', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const catalog = [
    makeLawsuit({ requires: ['had_data_breach'] }, { id: 'rule-breach', category: 'Data Breach' }),
    makeLawsuit({ requires: ['owns_vehicle'] }, { id: 'rule-auto', category: 'Auto & Vehicles' }),
    makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      { id: 'rule-ca-breach', category: 'Data Breach' },
    ),
    makeLawsuit({ states: ['CA'] }, { id: 'state-ca' }),
    makeLawsuit({ states: ['NY'] }, { id: 'state-ny' }),
    makeLawsuit(
      {},
      { id: 'soft-breach', category: 'Data Breach', title: 'Retailer Data Breach Settlement' },
    ),
    makeLawsuit({}, { id: 'soft-auto', category: 'Auto & Vehicles', title: 'Toyota Brake Settlement' }),
    makeLawsuit(
      {},
      { id: 'soft-bank', category: 'Financial & Banking', title: 'Overdraft Fee Settlement' },
    ),
    makeLawsuit({}, { id: 'soft-general', category: 'General', title: 'Miscellaneous Consumer Settlement' }),
    makeLawsuit(
      { requires: ['had_data_breach'] },
      { id: 'expired-breach', deadline: '2026-10-15' },
    ),
    makeLawsuit(
      {},
      {
        id: 'expired-soft',
        category: 'Data Breach',
        title: 'Closed Data Breach Settlement',
        deadline: '2026-10-15',
      },
    ),
  ];

  const empty = makeProfile();
  const caOnly = makeProfile({ state: 'CA' });
  const caBreach = makeProfile({ state: 'CA', attributes: { had_data_breach: true } });
  const caCar = makeProfile({
    state: 'CA',
    attributes: { owns_vehicle: true, vehicle_brands: ['Toyota'] },
  });

  function ids(profile: ReturnType<typeof makeProfile>) {
    return matchProfile(profile, catalog, 0.4, now).map((r) => r.lawsuit_id);
  }

  it('before flags: empty=0, CA-only=1 (state), CA+breach=3, CA+car=2; expired never match', () => {
    expect(ids(empty)).toEqual([]);
    expect(ids(caOnly)).toEqual(['state-ca']);
    expect(ids(caBreach)).toEqual(['rule-breach', 'rule-ca-breach', 'state-ca']);
    expect(ids(caCar)).toEqual(['rule-auto', 'state-ca']);
    expect(ids(caBreach)).not.toContain('expired-breach');
    expect(ids(caBreach)).not.toContain('expired-soft');
  });

  it('after flags: empty stays 0; CA+breach adds the soft breach; state-only is capped', () => {
    vi.stubEnv('MATCH_UNSTRUCTURED_ENABLED', '1');
    vi.stubEnv('MATCH_STATE_ONLY_CAP_ENABLED', '1');

    expect(ids(empty)).toEqual([]);
    expect(ids(caOnly)).toEqual(['state-ca']);
    expect(matchProfile(caOnly, catalog, 0.4, now)[0].score).toBe(STATE_ONLY_SCORE_CAP);

    expect(ids(caBreach)).toEqual(['rule-breach', 'rule-ca-breach', 'state-ca', 'soft-breach']);
    expect(ids(caCar)).toEqual(['rule-auto', 'state-ca', 'soft-auto']);
    expect(ids(caBreach)).not.toContain('expired-breach');
    expect(ids(caCar)).not.toContain('soft-general');
  });
});

describe('classifyMatch — labels people see', () => {
  it('calls a requires/anyOf hit a strong match and state-only or unstructured a possible match', () => {
    expect(classifyMatch(makeLawsuit({ requires: ['had_data_breach'] }))).toBe('strong');
    expect(classifyMatch(makeLawsuit({ anyOf: { vehicle_brands: ['Toyota'] } }))).toBe('strong');
    expect(classifyMatch(makeLawsuit({ states: ['CA'] }))).toBe('possible');
    expect(classifyMatch(makeLawsuit({}))).toBe('possible');
    expect(matchStrengthLabel('strong')).toBe('Strong match');
    expect(matchStrengthLabel('possible')).toBe('Possible match');
  });
});
