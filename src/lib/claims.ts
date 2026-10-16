/**
 * The claim model for the self-file flow (Phase 0, Part A). Pure functions only:
 * no Supabase and no network, so it is safe in client and server code and is
 * tested in tests/claims-*.test.ts.
 *
 * ClaimMatch never files or submits a claim for anyone. People check the
 * official notice, file on the administrator's site themselves and tell
 * ClaimMatch here. States follow the approved plan's state machine (WP:89-134).
 */
import { z } from 'zod';
import type { ClaimStatus } from './types';

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

export const CLAIM_STATUSES = [
  'self_file',
  'reported_filed',
  'submitted',
  'not_reported_filed',
  'withdrawn',
  'processing',
  'approved',
  'rejected',
  'paid',
] as const satisfies readonly ClaimStatus[];

/** Values only the retired e-sign flow (or older data) could have written. */
const LEGACY_ONLY = new Set<string>(['processing', 'approved', 'rejected', 'paid']);
const KNOWN = new Set<string>(CLAIM_STATUSES);

export function isKnownClaimStatus(value: string): value is ClaimStatus {
  return KNOWN.has(value);
}

/** The claim fields this model reads. Every column added by 0006 is optional. */
export interface ClaimFields {
  status: string;
  confirmation_number?: string | null;
  reported_filed_at?: string | null;
  user_filed_on?: string | null;
  corrective_notice_answered_at?: string | null;
}

export function hasConfirmationNumber(claim: Pick<ClaimFields, 'confirmation_number'>): boolean {
  return typeof claim.confirmation_number === 'string' && claim.confirmation_number.trim() !== '';
}

/**
 * True for claims written before Part A. The old e-sign flow stored 'submitted'
 * (plus filed_at and a fee row) although nothing was filed, so 'submitted'
 * without a confirmation number is legacy and reads "Not filed".
 */
export function isLegacyClaim(claim: ClaimFields): boolean {
  if (LEGACY_ONLY.has(claim.status)) return true;
  return claim.status === 'submitted' && !hasConfirmationNumber(claim);
}

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

/* -------------------------------------------------------------------------- */
/* Display: the one label every surface uses                                  */
/* -------------------------------------------------------------------------- */

export type ClaimTone = 'amber' | 'brand' | 'green' | 'gray' | 'red';
export type ClaimGroup = 'needs_filing' | 'reported' | 'submitted' | 'closed' | 'other';
export type ClaimKind =
  | 'self_file'
  | 'reported_filed'
  | 'submitted'
  | 'not_reported_filed'
  | 'withdrawn'
  | 'legacy_not_filed'
  | 'legacy_unconfirmed'
  | 'fictional'
  | 'unknown';

export interface ClaimDisplay {
  kind: ClaimKind;
  label: string;
  tone: ClaimTone;
  group: ClaimGroup;
  legacy: boolean;
  /** Show the corrective notice (D42) or, for a fictional settlement, its notice. */
  showNotice: boolean;
  confirmationNumber: string | null;
}

export const CLAIM_GROUP_LABELS: Record<ClaimGroup, string> = {
  needs_filing: 'Needs filing',
  reported: 'Reported filed',
  submitted: 'Submitted',
  closed: 'Closed',
  other: 'Status unavailable',
};

/** A confirmation number as shown after "#", without a "#" the user typed. */
export function displayConfirmationNumber(value: string): string {
  return value.trim().replace(/^#+\s*/, '');
}

export function displayClaimStatus(
  claim: ClaimFields,
  settlement?: SettlementContext | null,
): ClaimDisplay {
  const number = hasConfirmationNumber(claim) ? (claim.confirmation_number as string).trim() : null;
  const legacy = isLegacyClaim(claim);
  const passed = settlement?.deadlinePassed ?? false;
  const base = { legacy, confirmationNumber: number, showNotice: false };
  const unfiled = (kind: ClaimKind, label: string, tone: ClaimTone): ClaimDisplay => ({
    ...base,
    kind,
    label,
    tone: passed ? 'gray' : tone,
    group: passed ? 'closed' : 'needs_filing',
    showNotice: legacy && !claim.corrective_notice_answered_at,
  });

  if (settlement?.fictional) {
    return {
      ...base,
      kind: 'fictional',
      label: 'Not a real settlement',
      tone: 'gray',
      group: 'closed',
      showNotice: !claim.corrective_notice_answered_at,
    };
  }
  switch (claim.status) {
    case 'self_file':
      return passed
        ? { ...base, kind: 'self_file', label: 'Not reported filed', tone: 'gray', group: 'closed' }
        : { ...base, kind: 'self_file', label: 'Not filed yet', tone: 'amber', group: 'needs_filing' };
    case 'reported_filed':
      return { ...base, kind: 'reported_filed', label: 'Reported filed by you', tone: 'brand', group: 'reported' };
    case 'submitted':
      if (number) {
        return {
          ...base,
          kind: 'submitted',
          label: `Submitted · #${displayConfirmationNumber(number)}`,
          tone: 'green',
          group: 'submitted',
        };
      }
      return unfiled('legacy_not_filed', 'Not filed', 'red');
    case 'processing':
      return unfiled('legacy_not_filed', 'Not filed', 'red');
    case 'approved':
    case 'rejected':
    case 'paid':
      return unfiled('legacy_unconfirmed', 'Status not confirmed', 'amber');
    case 'not_reported_filed':
      return { ...base, kind: 'not_reported_filed', label: 'Not reported filed', tone: 'gray', group: 'closed' };
    case 'withdrawn':
      return { ...base, kind: 'withdrawn', label: 'Withdrawn by you', tone: 'gray', group: 'closed' };
    default:
      return { ...base, kind: 'unknown', label: 'Status unavailable', tone: 'gray', group: 'other' };
  }
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                */
/* -------------------------------------------------------------------------- */

/** Every status a claim may move to next (the Part A subset of WP:89-134). */
export function allowedNextStatuses(
  claim: ClaimFields,
  settlement?: SettlementContext | null,
): ClaimStatus[] {
  if (settlement?.fictional) return claim.status === 'withdrawn' ? [] : ['withdrawn'];
  if (isLegacyClaim(claim)) return ['self_file', 'reported_filed', 'submitted', 'withdrawn'];
  switch (claim.status) {
    case 'self_file':
      return ['reported_filed', 'submitted', 'withdrawn'];
    case 'reported_filed':
      return ['submitted', 'self_file'];
    case 'submitted':
      return ['submitted']; // the confirmation number can be corrected
    case 'not_reported_filed':
      return ['reported_filed', 'submitted'];
    default:
      return [];
  }
}

export interface ClaimActionAvailability {
  reportFiled: boolean;
  addConfirmation: boolean;
  correctConfirmation: boolean;
  undoReport: boolean;
  /** The one-tap answers on the corrective notice for a legacy claim. */
  answerCorrectiveNotice: boolean;
  /** "Got it" on the notice for a claim on a fictional settlement. */
  acknowledgeFictional: boolean;
}

const NOTHING_AVAILABLE: ClaimActionAvailability = {
  reportFiled: false,
  addConfirmation: false,
  correctConfirmation: false,
  undoReport: false,
  answerCorrectiveNotice: false,
  acknowledgeFictional: false,
};

export function claimActionAvailability(
  claim: ClaimFields,
  settlement?: SettlementContext | null,
): ClaimActionAvailability {
  const ctx = settlement ?? UNKNOWN_SETTLEMENT;
  if (!isKnownClaimStatus(claim.status)) return NOTHING_AVAILABLE;
  if (ctx.fictional) {
    const done = claim.status === 'withdrawn' && Boolean(claim.corrective_notice_answered_at);
    return { ...NOTHING_AVAILABLE, acknowledgeFictional: !done };
  }
  const legacy = isLegacyClaim(claim);
  const unreported = claim.status === 'self_file' || claim.status === 'not_reported_filed';
  return {
    // Legacy claims can always be answered (D42); others within the late window.
    reportFiled: legacy || (unreported && ctx.lateReportOpen),
    addConfirmation: claim.status === 'reported_filed',
    correctConfirmation: claim.status === 'submitted' && !legacy,
    undoReport: claim.status === 'reported_filed',
    answerCorrectiveNotice: legacy,
    acknowledgeFictional: false,
  };
}

export type ClaimAction =
  | { action: 'report_filed'; confirmation_number?: string; filed_on?: string }
  | { action: 'add_confirmation'; confirmation_number: string }
  | { action: 'undo_report' }
  | { action: 'acknowledge_notice' }
  /** Pure model only: the API does not offer withdrawing until Phase 2. */
  | { action: 'withdraw' };

export interface ClaimChanges {
  status?: ClaimStatus;
  confirmation_number?: string | null;
  reported_filed_at?: string | null;
  user_filed_on?: string | null;
  corrective_notice_answered_at?: string | null;
}

export interface TransitionPlan {
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
  changes: ClaimChanges;
  /** Stored on the claim_events row. */
  detail: Record<string, unknown>;
}

export type TransitionRefusal = 'not_allowed' | 'fictional' | 'window_closed' | 'unknown_status';

export type TransitionResult =
  | { ok: true; noop: true }
  | { ok: true; noop: false; plan: TransitionPlan }
  | { ok: false; refusal: TransitionRefusal; message: string };

export const FICTIONAL_SETTLEMENT_MESSAGE =
  'This settlement was not real, so there is nothing to file or report.';
const NOT_ALLOWED_MESSAGE = "That change isn't possible for this claim. Refresh the page and try again.";
const NOOP: TransitionResult = { ok: true, noop: true };

function refuse(refusal: TransitionRefusal, message: string): TransitionResult {
  return { ok: false, refusal, message };
}

function sameNumber(a: string, b: string | null | undefined): boolean {
  return typeof b === 'string' && a.trim() === b.trim();
}

/**
 * Plans one user action on a claim. The API applies the plan with the
 * service-role client and writes a claim_events row for it; the UI uses the
 * same function so buttons match what the server accepts.
 */
export function planClaimTransition(
  claim: ClaimFields,
  input: ClaimAction,
  settlement: SettlementContext | null | undefined,
  now: Date,
): TransitionResult {
  const ctx = settlement ?? UNKNOWN_SETTLEMENT;
  const from = claim.status;
  if (!isKnownClaimStatus(from)) {
    return refuse('unknown_status', "We can't update this claim right now. Please contact us.");
  }
  const at = now.toISOString();
  const can = claimActionAvailability(claim, ctx);
  const legacy = isLegacyClaim(claim);
  const plan = (changes: ClaimChanges, detail: Record<string, unknown>): TransitionResult => ({
    ok: true,
    noop: false,
    plan: { fromStatus: from, toStatus: changes.status ?? from, changes, detail },
  });

  if (ctx.fictional) {
    if (input.action !== 'acknowledge_notice') return refuse('fictional', FICTIONAL_SETTLEMENT_MESSAGE);
    if (!can.acknowledgeFictional) return NOOP;
    const changes: ClaimChanges = {};
    if (from !== 'withdrawn') changes.status = 'withdrawn';
    if (!claim.corrective_notice_answered_at) changes.corrective_notice_answered_at = at;
    return plan(changes, { action: 'acknowledge_notice', answer: 'not_a_real_settlement' });
  }

  switch (input.action) {
    case 'report_filed': {
      const number = input.confirmation_number ?? null;
      const filedOn = input.filed_on ?? null;
      if (from === 'reported_filed') {
        if (!number) return NOOP; // already reported (a double submit)
        const changes: ClaimChanges = { status: 'submitted', confirmation_number: number };
        if (filedOn) changes.user_filed_on = filedOn;
        return plan(changes, { action: 'add_confirmation', via: 'report_filed' });
      }
      if (from === 'submitted' && !legacy) {
        if (number && sameNumber(number, claim.confirmation_number)) return NOOP;
        return refuse(
          'not_allowed',
          'This claim already has a confirmation number. You can correct it instead.',
        );
      }
      if (!can.reportFiled) {
        if ((from === 'self_file' || from === 'not_reported_filed') && !ctx.lateReportOpen) {
          return refuse(
            'window_closed',
            'It has been more than 30 days since the deadline, so this claim can no longer be updated here.',
          );
        }
        return refuse('not_allowed', NOT_ALLOWED_MESSAGE);
      }
      const changes: ClaimChanges = {
        status: number ? 'submitted' : 'reported_filed',
        confirmation_number: number,
        reported_filed_at: at,
        user_filed_on: filedOn,
      };
      if (legacy && !claim.corrective_notice_answered_at) changes.corrective_notice_answered_at = at;
      return plan(changes, {
        action: 'report_filed',
        with_confirmation_number: Boolean(number),
        filed_on: filedOn,
        legacy,
      });
    }
    case 'add_confirmation': {
      const number = input.confirmation_number;
      if (can.addConfirmation) {
        return plan({ status: 'submitted', confirmation_number: number }, { action: 'add_confirmation' });
      }
      if (can.correctConfirmation) {
        if (sameNumber(number, claim.confirmation_number)) return NOOP;
        return plan(
          { confirmation_number: number },
          { action: 'correct_confirmation', previous_confirmation_number: claim.confirmation_number ?? null },
        );
      }
      return refuse('not_allowed', 'Tell us you filed first. Then you can add your confirmation number.');
    }
    case 'undo_report': {
      if (can.undoReport) {
        return plan(
          { status: 'self_file', confirmation_number: null, reported_filed_at: null, user_filed_on: null },
          { action: 'undo_report' },
        );
      }
      if (from === 'self_file') return NOOP;
      if (from === 'submitted' && !legacy) {
        return refuse(
          'not_allowed',
          "A claim with a confirmation number can't be undone. You can correct the number instead.",
        );
      }
      return refuse('not_allowed', NOT_ALLOWED_MESSAGE);
    }
    case 'acknowledge_notice': {
      if (!can.answerCorrectiveNotice) return NOOP;
      return plan(
        { status: 'self_file', corrective_notice_answered_at: claim.corrective_notice_answered_at ?? at },
        { action: 'acknowledge_notice', answer: 'not_filed_yet' },
      );
    }
    case 'withdraw': {
      if (from === 'withdrawn') return NOOP;
      if (from !== 'self_file' && !legacy) {
        return refuse('not_allowed', "A claim you've reported filed can't be withdrawn here.");
      }
      const changes: ClaimChanges = { status: 'withdrawn' };
      if (legacy && !claim.corrective_notice_answered_at) changes.corrective_notice_answered_at = at;
      return plan(changes, { action: 'withdraw' });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Input validation for the claim routes                                      */
/* -------------------------------------------------------------------------- */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const CONFIRMATION_MIN = 3;
export const CONFIRMATION_MAX = 64;
export const FILED_ON_EARLIEST = '2000-01-01';

/** Trimmed, 3-64 characters of letters, digits, spaces and - # / . */
export const confirmationNumberSchema = z
  .string({
    required_error: 'Enter your confirmation number.',
    invalid_type_error: 'Enter the confirmation number as text.',
  })
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(CONFIRMATION_MIN, 'That confirmation number looks too short. Check it and try again.')
      .max(CONFIRMATION_MAX, 'That confirmation number is too long. Use 64 characters or fewer.')
      .regex(/^[A-Za-z0-9 \-#/.]+$/, 'Use only letters, numbers, spaces and - # / . in the confirmation number.')
      .regex(/[A-Za-z0-9]/, 'The confirmation number needs at least one letter or number.'),
  );

/** Today's date in the earliest time zone (UTC+14), so no one's "today" is refused. */
export function latestFiledOnDate(now: Date): string {
  return new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10);
}

export function validateFiledOn(value: string, now: Date): ParseResult<string> {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !parseCalendarDate(v)) {
    return { ok: false, message: "That date isn't valid. Pick it from the calendar or type it as YYYY-MM-DD." };
  }
  if (v < FILED_ON_EARLIEST) return { ok: false, message: 'The filing date must be in 2000 or later.' };
  if (v > latestFiledOnDate(now)) return { ok: false, message: "The filing date can't be in the future." };
  return { ok: true, value: v };
}

const blankToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

const claimPatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('report_filed'),
    confirmation_number: z.preprocess(blankToUndefined, confirmationNumberSchema.optional()),
    filed_on: z.preprocess(
      blankToUndefined,
      z.string({ invalid_type_error: 'Enter the filing date as YYYY-MM-DD.' }).optional(),
    ),
  }),
  z.object({ action: z.literal('add_confirmation'), confirmation_number: confirmationNumberSchema }),
  z.object({ action: z.literal('undo_report') }),
  z.object({ action: z.literal('acknowledge_notice') }),
]);

function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request.';
  if (issue.code === 'invalid_union_discriminator') return 'Unknown action.';
  if (issue.path.length === 0) return 'Invalid request.';
  return issue.message;
}

/** Validates a PATCH /api/claims/[id] body. Never throws. */
export function parseClaimPatch(body: unknown, now: Date): ParseResult<ClaimAction> {
  const parsed = claimPatchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
  const value = parsed.data;
  if (value.action === 'report_filed' && value.filed_on !== undefined) {
    const date = validateFiledOn(value.filed_on, now);
    if (!date.ok) return date;
    return { ok: true, value: { ...value, filed_on: date.value } };
  }
  return { ok: true, value };
}

const startTrackingSchema = z.object({
  lawsuit_id: z
    .string({ required_error: 'Pick a settlement first.' })
    .uuid("That settlement link isn't valid. Go back and pick the settlement again."),
});

/**
 * Validates a POST /api/claims body. `legacyPayload` flags the retired e-sign
 * request (it carried a signature), which must never start or "file" a claim.
 */
export function parseStartTracking(
  body: unknown,
): ParseResult<{ lawsuitId: string }> & { legacyPayload?: boolean } {
  if (body && typeof body === 'object' && 'signature_name' in body) {
    return { ok: false, message: 'This page is out of date.', legacyPayload: true };
  }
  const parsed = startTrackingSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: firstMessage(parsed.error) };
  return { ok: true, value: { lawsuitId: parsed.data.lawsuit_id } };
}

/* -------------------------------------------------------------------------- */
/* Content helpers and the claim shape sent to the browser                    */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER_ELIGIBILITY = new Set(['open to eligible us residents.', 'open to eligible us residents']);

/** The listing's eligibility text, or null when it is empty or a feed placeholder. */
export function eligibilitySummary(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t || PLACEHOLDER_ELIGIBILITY.has(t.toLowerCase())) return null;
  return t;
}

export type ProofNeed = 'required' | 'optional' | 'none' | 'unknown';

/** Proof rule as the source states it. Unknown never reads as "none". */
export function proofNeed(l: { proof_required?: boolean | null; eligibility?: unknown }): ProofNeed {
  const e = (l.eligibility ?? {}) as { proof?: unknown; notes?: unknown };
  if (e.proof === 'yes' || l.proof_required === true) return 'required';
  if (e.proof === 'optional') return 'optional';
  if (typeof e.notes === 'string' && /proof[^.]*optional/i.test(e.notes)) return 'optional';
  if (e.proof === 'no') return 'none';
  return 'unknown';
}

/** The claim fields the browser receives (no legacy e-sign or fee columns). */
export interface ClaimView {
  id: string;
  lawsuit_id: string;
  lawsuit_title: string;
  status: string;
  confirmation_number: string | null;
  reported_filed_at: string | null;
  user_filed_on: string | null;
  corrective_notice_answered_at: string | null;
  created_at: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function toClaimView(row: Record<string, unknown>): ClaimView {
  return {
    id: String(row.id ?? ''),
    lawsuit_id: String(row.lawsuit_id ?? ''),
    lawsuit_title: str(row.lawsuit_title) ?? 'Settlement',
    status: String(row.status ?? ''),
    confirmation_number: str(row.confirmation_number),
    reported_filed_at: str(row.reported_filed_at),
    user_filed_on: str(row.user_filed_on),
    corrective_notice_answered_at: str(row.corrective_notice_answered_at),
    created_at: str(row.created_at),
  };
}

/** True when a claims row carries the 0006 columns (the migration has run). */
export function hasSelfFileColumns(row: Record<string, unknown>): boolean {
  return 'confirmation_number' in row && 'reported_filed_at' in row && 'corrective_notice_answered_at' in row;
}
