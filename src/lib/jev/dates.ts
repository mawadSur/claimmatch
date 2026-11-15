/**
 * Calendar arithmetic for Jev's deadline rules. Dates are YYYY-MM-DD calendar
 * days; "today" is the calendar day of `now` in the settlement's time zone
 * (the spec's deadline.time_zone, America/New_York without one), so an
 * evening UTC clock never moves a US deadline day early, and DST changes
 * never shift a day count. Business days are Monday to Friday (no holiday
 * calendar: administrators publish none we can rely on).
 */
import { calendarDateInZone } from '../utils';
import { isIsoDate } from './formats';

export const DEFAULT_DEADLINE_TIME_ZONE = 'America/New_York';
const DAY_MS = 86_400_000;
const zoneValidity = new Map<string, boolean>();

/** Whether `zone` is an IANA time zone this runtime knows. */
export function isKnownTimeZone(zone: string): boolean {
  let known = zoneValidity.get(zone);
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      known = zone.length > 0;
    } catch {
      known = false;
    }
    zoneValidity.set(zone, known);
  }
  return known;
}

/** The zone to count days in: the spec's, or America/New_York when it is missing or unknown. */
export function resolveTimeZone(zone: string | null | undefined): { zone: string; valid: boolean } {
  if (zone === null || zone === undefined || zone === '') return { zone: DEFAULT_DEADLINE_TIME_ZONE, valid: true };
  return isKnownTimeZone(zone) ? { zone, valid: true } : { zone: DEFAULT_DEADLINE_TIME_ZONE, valid: false };
}

/** The calendar day of `now` in `zone`, or null when `now` is not a valid instant. */
export function todayInZone(now: string | Date, zone: string): string | null {
  const instant = typeof now === 'string' ? new Date(now) : now;
  if (Number.isNaN(instant.getTime())) return null;
  return calendarDateInZone(instant, resolveTimeZone(zone).zone);
}

function utcDay(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

/** `ymd` moved by `days` calendar days. */
export function addDays(ymd: string, days: number): string {
  return new Date(utcDay(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 for Sunday through 6 for Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(utcDay(ymd)).getUTCDay();
}

/** Monday-to-Friday days from `from` through `to`, both included; 0 when `to` is before `from`. */
export function businessDaysThrough(from: string, to: string): number {
  const total = daysBetween(from, to) + 1;
  if (total <= 0) return 0;
  const start = weekdayOf(from);
  let count = Math.floor(total / 7) * 5;
  for (let k = 0; k < total % 7; k++) {
    const day = (start + k) % 7;
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** The leading YYYY-MM-DD of a deadline value when it is a real day (lawsuits.deadline is a date). */
export function deadlineDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const day = value.trim().slice(0, 10);
  return isIsoDate(day) ? day : null;
}

export interface DeadlineFacts {
  /** The effective deadline day, or null without one. */
  deadline: string | null;
  /** Calendar days from today to the deadline in the zone: 0 on the last day, negative once passed. */
  daysToDeadline: number | null;
  /** Today in the zone, or null when it cannot be known. */
  today: string | null;
}

/**
 * The deadline facts Jev uses. The caller's daysToDeadline wins (it is the
 * same count chooseLane uses); today is derived from it so both agree. Only
 * when the caller sends a deadline without a count does Jev count itself.
 */
export function deadlineFacts(args: {
  now: string;
  zone: string;
  deadline: string | null;
  daysToDeadline: number | null;
}): DeadlineFacts {
  const deadline = deadlineDay(args.deadline);
  if (!deadline) return { deadline: null, daysToDeadline: null, today: todayInZone(args.now, args.zone) };
  if (typeof args.daysToDeadline === 'number' && Number.isInteger(args.daysToDeadline)) {
    return { deadline, daysToDeadline: args.daysToDeadline, today: addDays(deadline, -args.daysToDeadline) };
  }
  const today = todayInZone(args.now, args.zone);
  return { deadline, daysToDeadline: today ? daysBetween(today, deadline) : null, today };
}
