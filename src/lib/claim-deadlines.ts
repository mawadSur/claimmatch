/**
 * Claim deadlines and the settlement facts the claim flow depends on. Pure
 * functions (no Supabase, no network); re-exported from '@/lib/claims'.
 */

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                  */
/* Records carry a date-only deadline. Until they carry their own time zone, a */
/* deadline stays open through 23:59:59 on that date in Pacific/Honolulu      */
/* (UTC-10, no daylight saving), the latest US time zone. People are told to  */
/* check the official site for the exact cutoff.                              */
/* -------------------------------------------------------------------------- */

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

/** The last moment a date-only deadline is open: 23:59:59.999 in Honolulu. */
export function deadlineCutoff(deadline: string | null | undefined): Date | null {
  const p = parseCalendarDate(deadline);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1) + HONOLULU_OFFSET_MS - 1);
}

export function isDeadlinePassed(deadline: string | null | undefined, now: Date): boolean {
  const cutoff = deadlineCutoff(deadline);
  return cutoff !== null && now.getTime() > cutoff.getTime();
}

/** Calendar days left, counted in Honolulu: 0 on the last day, negative after. */
export function daysUntilDeadline(deadline: string | null | undefined, now: Date): number | null {
  const p = parseCalendarDate(deadline);
  if (!p) return null;
  const local = new Date(now.getTime() - HONOLULU_OFFSET_MS);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - today) / DAY_MS);
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
  /** Published, real, not closed or draft, and the deadline has not passed. */
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
 * The claim flow's open-for-claims rule: published, not fictional, status not
 * closed or draft, deadline not passed. INTEGRATION: the catalog workstream
 * exports the shared rule; replace this with it when the branches merge.
 */
export function isOpenForClaims(s: SettlementFacts, now: Date, isFictional: IsFictional): boolean {
  return (
    s.review_status === 'published' &&
    !isFictional(s.slug) &&
    s.status !== 'closed' &&
    s.status !== 'draft' &&
    !isDeadlinePassed(s.deadline, now)
  );
}

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
    openForClaims: isOpenForClaims(s, now, isFictional),
    lateReportOpen: !fictional && isLateReportWindowOpen(s.deadline, now),
  };
}

