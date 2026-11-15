/**
 * Calendar math for one-click filing lanes (docs/designs/one-click-filing.md,
 * section 4): the effective deadline, a channel's cutoff (the last day
 * Lawsuit AI can still take a claim) and the desk SLA. Pure.
 *
 * Deadlines are calendar dates. Days are counted in the spec's
 * deadline.time_zone, America/New_York without one, the zone the rest of the
 * site uses for deadlines (src/lib/utils.ts).
 */
import { calendarDateInZone } from '@/lib/utils';

export const DEFAULT_DEADLINE_TIME_ZONE = 'America/New_York';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** True when Intl knows the zone (an approved spec with a typo must not throw). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The leading YYYY-MM-DD of a value when it is a real calendar day, else null. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** The spec's deadline zone, or America/New_York. Null when the spec names a zone Intl does not know. */
export function specTimeZone(content: { deadline?: { time_zone?: string | null } | null } | null | undefined): string | null {
  const zone = content?.deadline?.time_zone;
  if (zone === undefined || zone === null || zone === '') return DEFAULT_DEADLINE_TIME_ZONE;
  return isValidTimeZone(zone) ? zone : null;
}

/** The earlier of the settlement's deadline and the spec's deadline.date; null when neither is a date. */
export function effectiveDeadline(
  lawsuitDeadline: string | null | undefined,
  specDeadline: string | null | undefined,
): string | null {
  const dates = [toIsoDate(lawsuitDeadline), toIsoDate(specDeadline)].filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

/** Today's calendar date in the zone. */
export function todayIn(zone: string, now: Date): string {
  return calendarDateInZone(now, zone);
}

export function addDays(date: string, days: number): string {
  const iso = toIsoDate(date);
  if (!iso) throw new RangeError(`not a calendar date: ${date}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Whole calendar days from today (in the zone) to the date: 0 on the day itself, negative after it. */
export function daysUntilDate(date: string | null, zone: string, now: Date): number | null {
  const iso = toIsoDate(date);
  if (!iso) return null;
  return dayNumber(iso) - dayNumber(todayIn(zone, now));
}

/** Effective deadline minus the channel's buffer, in calendar days; null without a deadline. */
export function lastDayForAgent(deadline: string | null, minDaysBeforeDeadline: number): string | null {
  const iso = toIsoDate(deadline);
  return iso ? addDays(iso, -minDaysBeforeDeadline) : null;
}

/** True while today (in the zone) is on or before `lastDay`. No last day means no cutoff. */
export function withinCutoff(lastDay: string | null, zone: string, now: Date): boolean {
  return lastDay === null || todayIn(zone, now) <= lastDay;
}

/** First instant of a calendar date in the zone. */
export function startOfDay(date: string, zone: string): Date {
  const iso = toIsoDate(date);
  if (!iso) throw new RangeError(`not a calendar date: ${date}`);
  const [y, m, d] = iso.split('-').map(Number);
  let lo = Date.UTC(y, m - 1, d) - 15 * HOUR_MS;
  let hi = Date.UTC(y, m - 1, d) + 15 * HOUR_MS;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calendarDateInZone(new Date(mid), zone) >= iso) hi = mid;
    else lo = mid + 1;
  }
  return new Date(lo);
}

/** Last millisecond of a calendar date in the zone. */
export function endOfDay(date: string, zone: string): Date {
  return new Date(startOfDay(addDays(date, 1), zone).getTime() - 1);
}

function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * now plus `businessDays` business days (Monday to Friday in the zone; no
 * holiday calendar), never after the end of `capDate` in the zone.
 */
export function addBusinessDaysCapped(now: Date, businessDays: number, zone: string, capDate: string | null): Date {
  let t = now.getTime();
  let added = 0;
  while (added < businessDays) {
    t += DAY_MS;
    if (!isWeekend(calendarDateInZone(new Date(t), zone))) added += 1;
  }
  const cap = capDate ? endOfDay(capDate, zone).getTime() : Number.POSITIVE_INFINITY;
  return new Date(Math.min(t, cap));
}

/** "Thursday, November 12, 2026" for a calendar date (member notices). */
export function formatCalendarDate(date: string): string {
  const iso = toIsoDate(date);
  if (!iso) return date;
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
