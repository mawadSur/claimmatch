import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_QUESTIONS } from '@/lib/eligibility';
import { scoreLawsuit } from '@/lib/matching';
import { makeLawsuit, makeProfile } from './helpers';

describe('ELIGIBILITY_QUESTIONS — questionnaire integrity', () => {
  it('uses a unique, non-empty key for every question', () => {
    const keys = ELIGIBILITY_QUESTIONS.map((q) => q.key);
    expect(keys.every((k) => k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leads with the state question so the matcher can hard-gate on location', () => {
    const state = ELIGIBILITY_QUESTIONS.find((q) => q.key === 'state');
    expect(state).toBeDefined();
    expect(state?.type).toBe('state');
  });

  it('gives every multiselect/select question a non-empty options list', () => {
    for (const q of ELIGIBILITY_QUESTIONS) {
      if (q.type === 'multiselect' || q.type === 'select') {
        expect(q.options, `question "${q.key}" needs options`).toBeTruthy();
        expect((q.options ?? []).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('questionnaire ↔ matcher coupling', () => {
  it('produces a human-friendly reason for every attribute question the user can answer', () => {
    // Every non-state question key should have a curated label in the matcher —
    // i.e. it must not fall back to the generic "Matches: <key>" template. This
    // is the contract between the onboarding questionnaire and scoreLawsuit.
    const attributeQuestions = ELIGIBILITY_QUESTIONS.filter((q) => q.key !== 'state');

    for (const q of attributeQuestions) {
      const result = scoreLawsuit(
        makeProfile({ attributes: { [q.key]: true } }),
        makeLawsuit({ requires: [q.key] }),
      );
      expect(result.eligible, `question "${q.key}" should map to an eligible match`).toBe(true);
      const reason = result.reasons.find((r) => r !== 'Open nationwide');
      expect(reason, `question "${q.key}" should yield a reason`).toBeDefined();
      expect(
        reason?.startsWith('Matches:'),
        `question "${q.key}" is missing a curated label in matching.ts`,
      ).toBe(false);
    }
  });
});
