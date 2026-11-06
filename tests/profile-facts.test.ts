import { describe, expect, it } from 'vitest';
import { dateRangesOverlap, parseProfileFacts } from '@/lib/profile-facts';

describe('parseProfileFacts', () => {
  it('keeps valid rows and drops blanks', () => {
    const parsed = parseProfileFacts([
      { type: 'purchase', value: 'Toyota', start_date: '2021-03-01', end_date: '2021-03-01' },
      { type: 'brand', value: '  ' },
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.facts).toHaveLength(1);
      expect(parsed.facts[0].value).toBe('Toyota');
    }
  });

  it('rejects an unknown type and a backwards date range', () => {
    expect(parseProfileFacts([{ type: 'health', value: 'x' }]).ok).toBe(false);
    expect(
      parseProfileFacts([{ type: 'brand', value: 'x', start_date: '2022-01-01', end_date: '2021-01-01' }]).ok,
    ).toBe(false);
  });
});

describe('dateRangesOverlap', () => {
  it('treats missing bounds as open and overlaps inclusive ranges', () => {
    expect(dateRangesOverlap('2021-01-01', '2021-12-31', '2019-01-01', '2022-12-31')).toBe(true);
    expect(dateRangesOverlap('2015-01-01', '2015-12-31', '2019-01-01', '2022-12-31')).toBe(false);
    expect(dateRangesOverlap(null, null, '2019-01-01', '2022-12-31')).toBe(true);
    expect(dateRangesOverlap('2022-12-31', '2022-12-31', '2019-01-01', '2022-12-31')).toBe(true);
  });
});
