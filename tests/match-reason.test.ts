import { describe, expect, it } from 'vitest';
import { matchReasonLine, publicMatchReasons } from '@/lib/match-reason';

describe('match reason line', () => {
  it('quotes the user answer for a state hit', () => {
    expect(matchReasonLine(['Available in your state (NY)'])).toBe('You said you live in NY');
  });

  it('quotes a lived-in fact without inventing years', () => {
    expect(matchReasonLine(['Lived in NY, a covered state'])).toBe('You said you lived in NY');
  });

  it('quotes a purchase fact', () => {
    expect(matchReasonLine(['Bought Toyota in 2021, inside the class period'])).toBe(
      'You said you bought Toyota in 2021, inside the class period',
    );
  });

  it('excludes health and medication wording', () => {
    const reasons = [
      'Took medication for high blood pressure',
      'Your medical device may be covered',
      'took_medication',
      'Available in your state (CA)',
    ];
    expect(publicMatchReasons(reasons)).toEqual(['Available in your state (CA)']);
    expect(matchReasonLine(reasons)).toBe('You said you live in CA');
    expect(matchReasonLine(['Took medication XYZ'])).toBeNull();
  });

  it('skips generic filler when a specific reason exists', () => {
    expect(
      matchReasonLine(['Open nationwide', 'You own or lease a vehicle', 'May relate to your profile']),
    ).toBe('You own or lease a vehicle');
  });

  it('returns null when nothing public remains', () => {
    expect(matchReasonLine([])).toBeNull();
    expect(matchReasonLine(['  ', 'took_medication'])).toBeNull();
  });
});
