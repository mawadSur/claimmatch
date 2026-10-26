/**
 * Claim deadlines and the settlement facts the claim flow depends on. Pure
 * functions (no Supabase, no network); re-exported from '@/lib/claims'.
 */
import { isOpenForClaims } from './open-for-claims';
import { daysLeftToFile, isDeadlinePassed } from './utils';

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                  */
/* Records carry a date-only deadline. Until they carry their own time zone, a */
/* deadline stays open through 23:59:59 on that date in Pacific/Honolulu      */
/* (UTC-10, no daylight saving), the latest US time zone. People are told to  */
/* check the official site for the exact cutoff.                              */
/*                                                                            */
/* The cutoff and the open-for-claims rule are shared with the catalog        */
/* (src/lib/utils.ts and src/lib/open-for-claims.ts) and re-exported here, so  */
/* every surface agrees.                                                      */
/* -------------------------------------------------------------------------- */

export { deadlineCutoff, isDeadlinePassed } from './utils';
export { isOpenForClaims } from './open-for-claims';

const DAY_MS = 86_400_000;
const HONOLULU_OFFSET_MS = 10 * 3_600_000;
/** A late "I filed it" is accepted this many days after the deadline (WP:112). */
export const LATE_REPORT_DAYS = 30;

interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

/** Parses the YYYY-MM-DD start of a value; null unless it is a real calendar day. */
export function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

/**
 * Calendar days left to file: 0 on the last day, negative once the deadline
 * has passed. While the deadline is open this is the catalog's count
 * (daysLeftToFile, in UTC days), which never overstates the time left for
 * anyone in the US, so the claim page and the settlement page show the same
 * number. After the cutoff it counts days since the deadline, in Honolulu.
 */
export function daysUntilDeadline(deadline: string | null | undefined, now: Date): number | null {
  const p = parseCalendarDate(deadline);
  if (!p) return null;
  if (!isDeadlinePassed(deadline, now)) return daysLeftToFile(deadline, now);
  const local = new Date(now.getTime() - HONOLULU_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return Math.min(-1, Math.round((Date.UTC(p.y, p.m - 1, p.d) - today) / DAY_MS));
}

export function addCalendarDays(date: string | null | undefined, days: number): string | null {
  const p = parseCalendarDate(date);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + days)).toISOString().slice(0, 10);
}

/** The last day a late "I filed it" is accepted (deadline + 30 days), YYYY-MM-DD. */
export function lateReportLastDay(deadline: string | null | undefined): string | null {
  return addCalendarDays(deadline, LATE_REPORT_DAYS);
}

export function isLateReportWindowOpen(deadline: string | null | undefined, now: Date): boolean {
  const last = lateReportLastDay(deadline);
  return last === null || !isDeadlinePassed(last, now);
}

/** Plain-language countdown, e.g. "12 days left". Null without a valid deadline. */
export function deadlineCountdown(deadline: string | null | undefined, now: Date): string | null {
  const days = daysUntilDeadline(deadline, now);
  if (days === null) return null;
  if (days < 0) return 'Deadline passed';
  if (days === 0) return 'Last day is today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

/* -------------------------------------------------------------------------- */
/* Settlement context                                                         */
/* -------------------------------------------------------------------------- */

export interface SettlementFacts {
  slug: string;
  /** lawsuit_status: open | closing_soon | closed | draft */
  status: string;
  /** review_status: draft | pending_review | published | rejected */
  review_status: string;
  deadline: string | null;
}

export type IsFictional = (slug: string) => boolean;

export interface SettlementContext {
  /** False when the settlement row could not be read. */
  known: boolean;
  fictional: boolean;
  published: boolean;
  /** Marked closed (or draft) by status, whatever the deadline says. */
  closedByStatus: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  /** The shared rule: published, real, open or closing soon, deadline not passed. */
  openForClaims: boolean;
  /** A late "I filed it" is still accepted (until 30 days after the deadline). */
  lateReportOpen: boolean;
}

export const UNKNOWN_SETTLEMENT: SettlementContext = {
  known: false,
  fictional: false,
  published: false,
  closedByStatus: false,
  deadline: null,
  deadlinePassed: false,
  openForClaims: false,
  lateReportOpen: true,
};

/**
 * The claim flow's view of a settlement. openForClaims is the shared rule
 * (isOpenForClaims: published, not fictional, status open or closing soon,
 * deadline not passed); `isFictional` adds the caller's own fictional check.
 */
export function settlementContext(
  s: SettlementFacts | null | undefined,
  now: Date,
  isFictional: IsFictional,
): SettlementContext {
  if (!s) return UNKNOWN_SETTLEMENT;
  const fictional = isFictional(s.slug);
  return {
    known: true,
    fictional,
    published: s.review_status === 'published',
    closedByStatus: s.status === 'closed' || s.status === 'draft',
    deadline: s.deadline ?? null,
    deadlinePassed: isDeadlinePassed(s.deadline, now),
    openForClaims: !fictional && isOpenForClaims(s, now),
    lateReportOpen: !fictional && isLateReportWindowOpen(s.deadline, now),
  };
}

/**
 * Someone with no claim yet can still tell us they filed, and the claim is
 * created with their report: anyone who says they filed enters tracking
 * (WP:141). Allowed on a real, published settlement until 30 days after its
 * deadline (WP:122), also when our list marks it closed while it is
 * re-checked (D41). Saving a claim before filing needs openForClaims.
 */
export function canReportWithoutClaim(settlement: SettlementContext): boolean {
  return settlement.known && settlement.published && !settlement.fictional && settlement.lateReportOpen;
}

