import { FILED_ON_EARLIEST } from '@shared/lib/claims';
import { todayInDeadlineZone } from '@shared/lib/utils';

/**
 * Calendar days for the "Date you filed" picker. Days are YYYY-MM-DD strings,
 * as the API takes them (validateFiledOn); the picker works with device-local
 * Date values, so each day maps to a local date and back.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The device's calendar date as YYYY-MM-DD (the web's localISODate in claim-api.ts). */
export function localISODate(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * The last day the picker offers: today in the deadline zone (America/New_York),
 * or the device's own date when that is later, so nobody east of New York is
 * refused the day they filed. Both are on or before the server's limit
 * (latestFiledOnDate: today in UTC+14).
 */
export function latestFilingDay(at: Date): string {
  const zone = todayInDeadlineZone(at);
  const local = localISODate(at);
  return local > zone ? local : zone;
}

function parts(day: string): [number, number, number] | null {
  const match = ISO_DAY.exec(day);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** A day as a local Date at noon (the picker's value; noon keeps it clear of DST changes). */
export function dayToDate(day: string, fallback: Date): Date {
  const p = parts(day);
  return p ? new Date(p[0], p[1] - 1, p[2], 12) : fallback;
}

/** The first moment of a day, device time (the picker's minimum). */
export function startOfDay(day: string): Date {
  const p = parts(day) ?? [2000, 1, 1];
  return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0);
}

/** The last moment of a day, device time (the picker's maximum, so the day itself can be picked). */
export function endOfDay(day: string): Date {
  const p = parts(day) ?? [2000, 1, 1];
  return new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999);
}

/** The earliest filing date the server takes (2000-01-01). */
export const EARLIEST_FILING_DAY = FILED_ON_EARLIEST;
