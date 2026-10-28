import { describe, expect, it } from 'vitest';
import {
  draftEligibilityForLawsuit,
  draftEligibilityFromText,
  extractStates,
  hasStructuredRules,
} from '@/lib/eligibility-draft';
import { classifyMatch, matchProfile } from '@/lib/matching';
import { makeLawsuit, makeProfile } from './helpers';

describe('eligibility rule drafter', () => {
  it('drafts structured rules from title, description and class definition', () => {
    const text = `
      New York Auto Data Breach Settlement
      Class definition: New York residents who own or lease a car and received
      a data-breach notice, and who had a bank account that was listed.
    `;
    const draft = draftEligibilityFromText(text);
    expect(draft.eligibility.states).toEqual(['NY']);
    expect(draft.eligibility.requires).toEqual(
      expect.arrayContaining(['had_data_breach', 'owns_vehicle', 'used_banking']),
    );
    expect(draft.eligibility.requires).not.toContain('took_medication');
    expect(draft.rationale.version).toBe('heuristic-v1');
  });

  it('does not draft over an existing structured rule set', () => {
    const lawsuit = makeLawsuit(
      { requires: ['had_data_breach'] },
      { title: 'New York car data breach', description: 'bank account' },
    );
    expect(hasStructuredRules(lawsuit.eligibility)).toBe(true);
    expect(draftEligibilityForLawsuit(lawsuit)).toBeNull();
  });

  it('returns null when the text has no usable signals', () => {
    expect(draftEligibilityFromText('A settlement exists.').eligibility).toEqual({});
    expect(extractStates('Open nationwide to United States residents')).toEqual([]);
  });
});

describe('NY profile regression', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const ny = makeProfile({
    state: 'NY',
    attributes: {
      owns_vehicle: true,
      used_banking: true,
      had_data_breach: true,
    },
  });

  it('labels a NY car + bank + data-breach profile as a Strong match', () => {
    const listing = makeLawsuit(
      {},
      {
        id: 'ny-auto-bank-breach',
        title: 'New York drivers data-breach and bank-account settlement',
        description:
          'New York residents who own a car, received a data-breach notice, and had a bank account.',
        eligibility_text: 'Class: NY vehicle owners with a data breach notice and a bank account.',
        category: 'Data Breach',
        deadline: '2026-12-31',
      },
    );
    const draft = draftEligibilityForLawsuit(listing);
    expect(draft).not.toBeNull();
    const structured = makeLawsuit(draft!.eligibility, {
      id: listing.id,
      title: listing.title,
      category: listing.category,
      deadline: listing.deadline,
    });
    expect(classifyMatch(structured)).toBe('strong');
    const hits = matchProfile(ny, [structured], 0.4, now);
    expect(hits).toHaveLength(1);
    expect(hits[0].lawsuit_id).toBe('ny-auto-bank-breach');
    expect(hits[0].eligible).toBe(true);
    expect(hits[0].score).toBeGreaterThanOrEqual(0.5);
  });
});
