import { describe, expect, it } from 'vitest';
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
  it('returns null when there is no deadline', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });

  it('counts whole UTC calendar days, negative once the date has passed', () => {
    const today = new Date();
    const iso = (offsetDays: number) => {
      const base = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      );
      return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
    };
    expect(daysUntil(iso(0))).toBe(0);
    expect(daysUntil(iso(10))).toBe(10);
    expect(daysUntil(iso(-3))).toBe(-3);
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
