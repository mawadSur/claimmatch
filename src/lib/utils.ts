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
 * viewer's timezone. For "is this still open?" use isDeadlinePassed instead:
 * UTC days flip to "passed" while the deadline day is still running in the US.
 */
export function daysUntil(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const deadlineUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((deadlineUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Claim deadlines
//
// Records store the deadline as a bare date with no time zone. Until each
// record carries its administrator's time zone (Phase 1), a deadline day counts
// as open through 23:59:59 in the latest US time zone, so a settlement is never
// hidden while it may still be open somewhere in the US. Pages tell people to
// check the official site for the exact cutoff.
// ---------------------------------------------------------------------------

/** The latest US time zone. Hawaii has no daylight saving time, so UTC-10 all year. */
export const LATEST_US_TIME_ZONE = 'Pacific/Honolulu';
const LATEST_US_UTC_OFFSET_HOURS = -10;
const HOUR_MS = 60 * 60 * 1000;
const LEADING_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The calendar date a deadline value names, as [year, month (1-12), day], or
 * null when it has none. Only the leading YYYY-MM-DD counts: any time part is
 * ignored because records do not say which time zone it is in.
 */
function deadlineDate(deadline: string): [number, number, number] | null {
  const m = LEADING_DATE.exec(deadline.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null; // e.g. 2026-02-30
  }
  return [y, mo, d];
}

/**
 * The first instant at which a deadline has passed: the day after the deadline
 * at 00:00 in Pacific/Honolulu (10:00 UTC). Null when there is no usable date.
 * Example: a 2026-10-15 deadline passes at 2026-10-16T10:00:00Z.
 */
export function deadlineCutoff(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const parts = deadlineDate(deadline);
  if (!parts) return null;
  const [y, mo, d] = parts;
  return new Date(Date.UTC(y, mo - 1, d + 1, -LATEST_US_UTC_OFFSET_HOURS));
}

/**
 * True once the deadline day has ended everywhere in the US. A missing or
 * unreadable deadline never counts as passed.
 */
export function isDeadlinePassed(
  deadline: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const cutoff = deadlineCutoff(deadline);
  return cutoff !== null && now.getTime() >= cutoff.getTime();
}

/**
 * Today's date (YYYY-MM-DD) in Pacific/Honolulu. A deadline is still open
 * exactly when `deadline >= todayInLatestUSZone()`, which is how database
 * queries apply the same rule as isDeadlinePassed.
 */
export function todayInLatestUSZone(now: Date = new Date()): string {
  return new Date(now.getTime() + LATEST_US_UTC_OFFSET_HOURS * HOUR_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Whole days left to file, for urgency labels. Counted in UTC days, which run
 * ahead of every US time zone, so we never overstate the time left; 0 means
 * "last day". Null when there is no deadline or it has passed.
 */
export function daysLeftToFile(
  deadline: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!deadline || !deadlineDate(deadline)) return null;
  if (isDeadlinePassed(deadline, now)) return null;
  const days = daysUntil(deadline.trim().slice(0, 10), now);
  return days === null ? null : Math.max(0, days);
}

/** Short urgency label ("Last day to file", "3 days left"), or null when not urgent. */
export function deadlineUrgencyLabel(
  deadline: string | null | undefined,
  now: Date = new Date(),
  withinDays = 30,
): string | null {
  const days = daysLeftToFile(deadline, now);
  if (days === null || days > withinDays) return null;
  if (days === 0) return 'Last day to file';
  return `${days} day${days === 1 ? '' : 's'} left`;
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
  tagline: 'Free claim assistant for class-action settlements',
  description:
    'Find open class-action settlements, check who qualifies on the official notice, file on the official site, and keep track of your claims. Free.',
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
