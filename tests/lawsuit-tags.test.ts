import { describe, expect, it } from 'vitest';
import { extractLawsuitTags, lawsuitHasStructuredTags, normalizeLawsuitTags } from '@/lib/lawsuit-tags';

describe('extractLawsuitTags', () => {
  it('copies structured states and dateRange, and leaves unknown fields null', () => {
    const tags = extractLawsuitTags({
      title: 'Generic Consumer Settlement',
      eligibility: { states: ['CA', 'NY'], dateRange: { from: '2019-01-01', to: '2021-12-31' } },
    });
    expect(tags.states).toEqual(['CA', 'NY']);
    expect(tags.class_period_start).toBe('2019-01-01');
    expect(tags.class_period_end).toBe('2021-12-31');
    expect(tags.brands).toBeNull();
    expect(tags.employers).toBeNull();
  });

  it('extracts a known brand from the title and nothing invented', () => {
    const tags = extractLawsuitTags({ title: 'Toyota Brake Settlement' });
    expect(tags.brands).toEqual(['Toyota']);
    expect(tags.employers).toBeNull();
    expect(tags.states).toBeNull();
  });

  it('extracts an employer only from a clear “employees of” phrase', () => {
    const tags = extractLawsuitTags({
      category: 'Employment',
      eligibility_text: 'Hourly employees of Acme Logistics who worked in California.',
    });
    expect(tags.employers).toEqual(['Acme Logistics']);
  });

  it('does not guess a class period from vague copy', () => {
    const tags = extractLawsuitTags({
      eligibility_text: 'Anyone who bought the product during the relevant period.',
    });
    expect(tags.class_period_start).toBeNull();
    expect(tags.class_period_end).toBeNull();
  });

  it('parses an explicit class-period year range', () => {
    const tags = extractLawsuitTags({
      eligibility_text: 'Purchasers during the class period 2018 to 2020.',
    });
    expect(tags.class_period_start).toBe('2018-01-01');
    expect(tags.class_period_end).toBe('2020-12-31');
  });
});

describe('normalizeLawsuitTags', () => {
  it('drops empty lists and invalid dates', () => {
    expect(normalizeLawsuitTags({ brands: ['  '], class_period_start: 'tomorrow' })).toEqual({
      brands: null,
      employers: null,
      states: null,
      class_period_start: null,
      class_period_end: null,
    });
  });

  it('treats structured brand/employer tags as rule-like', () => {
    expect(lawsuitHasStructuredTags({ brands: ['Toyota'] })).toBe(true);
    expect(lawsuitHasStructuredTags({ states: ['CA'] })).toBe(false);
  });
});
