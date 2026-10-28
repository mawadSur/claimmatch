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
 * Counted in America/New_York calendar days so an evening UTC clock does not
 * flip the count while the deadline day is still running in the US.
 */
export function daysUntil(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const parts = typeof iso === 'string' ? deadlineDate(iso) : null;
  if (!parts) return null;
  const todayParts = deadlineDate(todayInDeadlineZone(now));
  if (!todayParts) return null;
  const deadlineUTC = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const todayUTC = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  return Math.round((deadlineUTC - todayUTC) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Claim deadlines
//
// Records store the deadline as a bare date with no time zone. Until each
// record carries its administrator's time zone, a deadline day stays open
// through that date in America/New_York. UTC midnight is still evening in
// the US, so comparing against today's UTC date would close settlements
// early. Pages tell people to check the official site for the exact cutoff.
// ---------------------------------------------------------------------------

/** Calendar zone for "is this deadline still open today?" */
export const DEADLINE_TIME_ZONE = 'America/New_York';
/** @deprecated Use DEADLINE_TIME_ZONE. Kept so existing imports stay valid. */
export const LATEST_US_TIME_ZONE = DEADLINE_TIME_ZONE;
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(parts: [number, number, number]): string {
  return `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
}

/** Today's calendar date (YYYY-MM-DD) in a named time zone. */
export function calendarDateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** First instant of `ymd` (YYYY-MM-DD) in `timeZone`, as a UTC Date. */
function startOfDayInZone(ymdValue: string, timeZone: string): Date {
  const parts = deadlineDate(ymdValue);
  if (!parts) return new Date(NaN);
  const [y, mo, d] = parts;
  let lo = Date.UTC(y, mo - 1, d) - 14 * HOUR_MS;
  let hi = Date.UTC(y, mo - 1, d) + 14 * HOUR_MS;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calendarDateInZone(new Date(mid), timeZone) >= ymdValue) hi = mid;
    else lo = mid + 1;
  }
  return new Date(lo);
}

/**
 * The first instant at which a deadline has passed: midnight at the start of
 * the next calendar day in America/New_York. Null when there is no usable date.
 * Example (EDT): a 2026-10-15 deadline passes at 2026-10-16T04:00:00Z.
 */
export function deadlineCutoff(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const parts = deadlineDate(deadline);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return startOfDayInZone(
    `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`,
    DEADLINE_TIME_ZONE,
  );
}

/**
 * True once the deadline day has ended in America/New_York. A missing or
 * unreadable deadline never counts as passed.
 */
export function isDeadlinePassed(
  deadline: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const parts = typeof deadline === 'string' ? deadlineDate(deadline) : null;
  if (!parts) return false;
  return ymd(parts) < todayInDeadlineZone(now);
}

/**
 * Today's date (YYYY-MM-DD) in America/New_York. A deadline is still open
 * exactly when `deadline >= todayInDeadlineZone()`, which is how database
 * queries apply the same rule as isDeadlinePassed.
 */
export function todayInDeadlineZone(now: Date = new Date()): string {
  return calendarDateInZone(now, DEADLINE_TIME_ZONE);
}

/** @deprecated Use todayInDeadlineZone. Same America/New_York calendar date. */
export function todayInLatestUSZone(now: Date = new Date()): string {
  return todayInDeadlineZone(now);
}

/**
 * Whole days left to file, for urgency labels. Counted in America/New_York
 * calendar days; 0 means "last day". Null when there is no deadline or it
 * has passed.
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
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://lawsuitai.org',
};

/** Absolute URL for metadata, sitemap and emails. */
export function canonicalUrl(path = '/'): string {
  const base = SITE.url.replace(/\/$/, '');
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

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
