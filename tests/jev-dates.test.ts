import { describe, expect, it } from 'vitest';
import { runJev } from '@/lib/jev';
import {
  addDays,
  businessDaysThrough,
  daysBetween,
  deadlineDay,
  deadlineFacts,
  resolveTimeZone,
  todayInZone,
  weekdayOf,
} from '@/lib/jev/dates';
import { codes, jevInput, specContent } from './jev-fixtures';

const NY = 'America/New_York';

describe('todayInZone', () => {
  it.each([
    // Spring forward: 2026-03-08 02:00 EST becomes 03:00 EDT (07:00Z).
    ['2026-03-08T04:30:00Z', '2026-03-07'],
    ['2026-03-08T05:30:00Z', '2026-03-08'],
    ['2026-03-08T07:30:00Z', '2026-03-08'],
    ['2026-03-09T03:59:00Z', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09'],
    // Fall back: 2026-11-01 02:00 EDT becomes 01:00 EST (06:00Z).
    ['2026-11-01T03:59:00Z', '2026-10-31'],
    ['2026-11-01T04:00:00Z', '2026-11-01'],
    ['2026-11-02T04:30:00Z', '2026-11-01'],
    ['2026-11-02T05:00:00Z', '2026-11-02'],
  ])('%s is %s in New York', (now, day) => {
    expect(todayInZone(now, NY)).toBe(day);
  });

  it('counts in the zone it is given', () => {
    expect(todayInZone('2026-11-13T09:59:00Z', 'Pacific/Honolulu')).toBe('2026-11-12');
    expect(todayInZone('2026-11-13T10:00:00Z', 'Pacific/Honolulu')).toBe('2026-11-13');
    expect(todayInZone('2026-11-13T07:59:00Z', 'America/Los_Angeles')).toBe('2026-11-12');
    expect(todayInZone('2026-11-13T07:59:00Z', NY)).toBe('2026-11-13');
    expect(todayInZone('not a time', NY)).toBeNull();
  });

  it('falls back to New York for a missing or unknown zone', () => {
    expect(resolveTimeZone(null)).toEqual({ zone: NY, valid: true });
    expect(resolveTimeZone('Pacific/Honolulu')).toEqual({ zone: 'Pacific/Honolulu', valid: true });
    expect(resolveTimeZone('Mars/Olympus_Mons')).toEqual({ zone: NY, valid: false });
  });
});

describe('calendar arithmetic', () => {
  it('counts whole days, unaffected by DST, leap years included', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-12', '2026-12-31')).toBe(49);
    expect(daysBetween('2026-11-12', '2026-11-11')).toBe(-1);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows the weekday', () => {
    expect([weekdayOf('2026-11-12'), weekdayOf('2026-11-14'), weekdayOf('2026-11-15'), weekdayOf('2026-11-16')]).toEqual([4, 6, 0, 1]);
  });

  it.each([
    ['2026-11-14', '2026-11-16', 1],
    ['2026-11-13', '2026-11-16', 2],
    ['2026-11-16', '2026-11-16', 1],
    ['2026-11-15', '2026-11-15', 0],
    ['2026-11-14', '2026-11-15', 0],
    ['2026-11-16', '2026-11-13', 0],
    ['2026-11-02', '2026-11-27', 20],
    ['2026-11-12', '2026-12-31', 36],
  ])('business days from %s through %s: %i', (from, to, n) => {
    expect(businessDaysThrough(from, to)).toBe(n);
  });

  it('reads the day of a deadline value', () => {
    expect(deadlineDay('2026-12-31')).toBe('2026-12-31');
    expect(deadlineDay('2026-12-31T00:00:00+00:00')).toBe('2026-12-31');
    expect(deadlineDay('2026-02-30')).toBeNull();
    expect(deadlineDay(null)).toBeNull();
  });
});

describe('deadlineFacts', () => {
  it('uses the caller’s count and derives today from it', () => {
    expect(deadlineFacts({ now: '2026-11-12T15:00:00Z', zone: NY, deadline: '2026-12-31', daysToDeadline: 49 })).toEqual({
      deadline: '2026-12-31',
      daysToDeadline: 49,
      today: '2026-11-12',
    });
  });

  it('counts itself in the zone when the caller sends a deadline without a count', () => {
    const facts = (now: string, zone = NY) => deadlineFacts({ now, zone, deadline: '2026-03-09', daysToDeadline: null }).daysToDeadline;
    expect(facts('2026-03-08T04:30:00Z')).toBe(2);
    expect(facts('2026-03-09T03:30:00Z')).toBe(1);
    expect(facts('2026-03-09T04:30:00Z')).toBe(0);
    expect(facts('2026-03-10T04:30:00Z')).toBe(-1);
    expect(facts('2026-03-09T09:30:00Z', 'Pacific/Honolulu')).toBe(1);
  });

  it('has no count without a deadline', () => {
    expect(deadlineFacts({ now: '2026-11-12T15:00:00Z', zone: NY, deadline: null, daysToDeadline: 3 })).toEqual({
      deadline: null,
      daysToDeadline: null,
      today: '2026-11-12',
    });
  });
});

describe('deadline rules in the settlement’s zone', () => {
  // The desk takes a claim through 5 calendar days before the deadline (2026-11-16 here).
  const at = (now: string, zone?: string, lane: 'filing_desk' | 'self_file' = 'filing_desk') =>
    runJev(
      jevInput(
        { lane, now, settlement: { openForClaims: true, deadline: '2026-11-16', daysToDeadline: null } },
        { content: specContent({ deadline: { date: '2026-11-16', time_zone: zone ?? NY, type: 'received_by' } }) },
      ),
    );

  it('keeps the last agent day open through the evening in New York although UTC has moved on', () => {
    expect(codes(at('2026-11-12T03:00:00Z'))).toEqual([]);
    expect(codes(at('2026-11-12T05:00:00Z'))).toContain('deadline_too_close');
  });

  it('follows the spec’s own zone', () => {
    expect(codes(at('2026-11-12T09:00:00Z', 'Pacific/Honolulu'))).toEqual([]);
    expect(codes(at('2026-11-12T09:00:00Z', NY))).toContain('deadline_too_close');
  });

  it('treats a deadline that falls today as open, though too close for the desk', () => {
    const today = at('2026-11-16T20:00:00Z');
    expect(codes(today)).not.toContain('deadline_passed');
    expect(codes(today)).toContain('deadline_too_close');
    expect(codes(at('2026-11-16T20:00:00Z', NY, 'self_file'))).toEqual([]);
    expect(codes(at('2026-11-17T05:00:00Z', NY, 'self_file'))).toEqual(['deadline_passed']);
  });

  it('warns about a future date using the zone’s today', () => {
    const input = (now: string) =>
      jevInput(
        { now, settlement: { openForClaims: true, deadline: null, daysToDeadline: null } },
        { answers: { purchase_date: '2026-11-12', item_count: 3 } },
      );
    expect(codes(runJev(input('2026-11-12T03:00:00Z')))).toEqual(['date_in_future']);
    expect(codes(runJev(input('2026-11-12T05:00:00Z')))).toEqual([]);
  });
});
