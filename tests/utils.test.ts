import { afterEach, describe, expect, it, vi } from 'vitest';
import { cn, daysUntil, formatDeadline, slugify } from '@/lib/utils';

describe('cn', () => {
  it('merges class names and lets later Tailwind utilities win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', false && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});

describe('formatDeadline', () => {
  it('renders an ISO date as a US-format calendar day, pinned to UTC', () => {
    expect(formatDeadline('2025-08-14')).toBe('Aug 14, 2025');
  });

  it('returns "Varies" for null, undefined, or an unparseable value', () => {
    expect(formatDeadline(null)).toBe('Varies');
    expect(formatDeadline(undefined)).toBe('Varies');
    expect(formatDeadline('not-a-date')).toBe('Varies');
  });
});

describe('daysUntil', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when there is no deadline', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });

  it('keeps the deadline day open during the US evening, when UTC is already tomorrow', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10 pm EDT on Oct 15. UTC date is Oct 16.
    vi.setSystemTime(new Date('2026-10-16T02:00:00Z'));
    expect(daysUntil('2026-10-15')).toBe(0);
    expect(daysUntil('2026-10-16')).toBe(1);
  });

  it('counts whole calendar days, negative once the date has passed', () => {
    // A frozen clock at midday UTC: the same calendar day in UTC and in every
    // US time zone, so the result doesn't depend on when or where tests run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    expect(daysUntil('2026-10-16')).toBe(0);
    expect(daysUntil('2026-10-26')).toBe(10);
    expect(daysUntil('2026-10-13')).toBe(-3);
    expect(daysUntil('2027-01-01')).toBe(77);
  });
});

describe('slugify', () => {
  it('lowercases, strips quotes, and hyphenates non-alphanumerics', () => {
    expect(slugify("Apple's Data Breach Settlement!")).toBe('apples-data-breach-settlement');
  });

  it('trims leading/trailing separators and collapses runs', () => {
    expect(slugify('  Hello   World  ')).toBe('hello-world');
  });

  it('caps the slug at 80 characters', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});
