import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_QUESTIONS, RETIRED_QUESTION_KEYS } from '@/lib/eligibility';
import {
  MATCHER_QUESTIONS,
  SENSITIVE_OPTIONAL_QUESTIONS,
  applyAttributePatch,
  parseAttributeAnswers,
  profileHasMatchSignals,
} from '@/lib/profile-attributes';

describe('profile attributes', () => {
  it('collects every matcher key except state, and keeps health optional', () => {
    expect(MATCHER_QUESTIONS.map((q) => q.key).sort()).toEqual(
      ELIGIBILITY_QUESTIONS.filter((q) => q.key !== 'state')
        .map((q) => q.key)
        .sort(),
    );
    expect(MATCHER_QUESTIONS.map((q) => q.key)).not.toContain('took_medication');
    expect(SENSITIVE_OPTIONAL_QUESTIONS.map((q) => q.key)).toEqual(['took_medication']);
    for (const key of RETIRED_QUESTION_KEYS) {
      expect(ELIGIBILITY_QUESTIONS.map((q) => q.key)).not.toContain(key);
    }
  });

  it('keeps only known answers and clears brands when the person does not own a vehicle', () => {
    expect(
      parseAttributeAnswers({
        had_data_breach: true,
        owns_vehicle: false,
        vehicle_brands: ['Toyota'],
        is_admin: true,
        took_medication: 'yes',
      }),
    ).toEqual({
      ok: true,
      attributes: {
        had_data_breach: true,
        owns_vehicle: false,
        vehicle_brands: [],
        took_medication: true,
      },
    });
  });

  it('replaces managed keys and leaves unknown stored keys alone', () => {
    expect(
      applyAttributePatch({ had_data_breach: true, legacy_note: 'keep' }, { used_banking: true }),
    ).toEqual({ used_banking: true, legacy_note: 'keep' });
  });

  it('detects matcher signals and ignores health-only answers', () => {
    expect(profileHasMatchSignals({ state: 'CA', attributes: {} })).toBe(true);
    expect(profileHasMatchSignals({ state: null, attributes: { had_data_breach: true } })).toBe(true);
    expect(profileHasMatchSignals({ state: null, attributes: { took_medication: true } })).toBe(false);
    expect(profileHasMatchSignals({ state: null, attributes: {} })).toBe(false);
  });
});
