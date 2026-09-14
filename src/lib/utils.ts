import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a deadline as e.g. "Aug 14, 2025". Returns "Varies" when null.
 * DB `date` values arrive as "YYYY-MM-DD" (no time/zone); we render them as the
 * same calendar day everywhere by pinning to UTC, avoiding a previous-day shift
 * in timezones behind UTC.
 */
export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return 'Varies';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Varies';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Whole days until a deadline; negative if passed, null if no deadline.
 * Compared as UTC calendar days so "days left" doesn't drift by one with the
 * viewer's timezone.
 */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const deadlineUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((deadlineUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

/** URL-safe slug from a title. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** US states for selects. */
export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

export const SITE = {
  name: 'ClaimMatch',
  tagline: 'Find the settlement money you’re owed.',
  description:
    'ClaimMatch scans class-action settlements and lawsuits, matches you to the ones you qualify for, and helps you file your claim in minutes.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://claimmatch.vercel.app',
};

/**
 * Check if a URL is a placeholder (example.com, .example TLD, localhost, etc.).
 * Returns true if the URL should not be shown to users as a working link.
 */
export function isPlaceholderUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const { hostname } = new URL(url);
    const lower = hostname.toLowerCase();
    return (
      lower === 'example.com' ||
      lower.endsWith('.example.com') ||
      lower.endsWith('.example') ||
      lower === 'localhost' ||
      lower.startsWith('127.') ||
      lower === '0.0.0.0'
    );
  } catch {
    return true;
  }
}

/**
 * Returns the URL only if it is a real, non-placeholder URL.
 * Returns null otherwise.
 */
export function getValidClaimUrl(url: string | null | undefined): string | null {
  if (!url || isPlaceholderUrl(url)) return null;
  return url;
}
