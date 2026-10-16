/**
 * The claim model for the self-file flow (Phase 0, Part A). Pure functions only:
 * no Supabase and no network, so it is safe in client and server code and is
 * tested in tests/claims-*.test.ts.
 *
 * ClaimMatch never files or submits a claim for anyone. People check the
 * official notice, file on the administrator's site themselves and tell
 * ClaimMatch here. States follow the approved plan's state machine (WP:89-134).
 *
 * Deadline rules live in ./claim-deadlines and input validation in
 * ./claim-input; both are re-exported here, so import from '@/lib/claims'.
 */
import type { ClaimStatus } from './types';
import { UNKNOWN_SETTLEMENT, lateReportLastDay, type SettlementContext } from './claim-deadlines';

export * from './claim-deadlines';
export * from './claim-input';

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

/** The claim fields this model reads. Every column added by 0006 or 0008 is optional. */
export interface ClaimFields {
  status: string;
  confirmation_number?: string | null;
  reported_filed_at?: string | null;
  user_filed_on?: string | null;
  corrective_notice_answered_at?: string | null;
  /**
   * The retired e-sign or File-all flow recorded this claim as filed: 0008's
   * marker, or its filed_at / authorized_at stamps (see toClaimView). Unlike a
   * legacy status, it survives the D38 correction that moves the claim to
   * self_file, so the corrective notice does too.
   */
  corrective_notice_required?: boolean | null;
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

/** States in which the user still has to file, or tell us they did. */
const UNFILED = new Set<string>(['self_file', 'not_reported_filed']);

/**
 * True for every claim the old flow showed as filed: one still in a legacy
 * status, or one the D38 correction (or the user's answer) has since moved,
 * which keeps the marker.
 */
export function wasShownAsFiled(claim: ClaimFields): boolean {
  return isLegacyClaim(claim) || claim.corrective_notice_required === true;
}

/**
 * The D42 corrective notice applies until the user answers it: on a claim in
 * a legacy status, or on a marked claim that is still waiting to be filed.
 */
export function needsCorrectiveNotice(claim: ClaimFields): boolean {
  if (claim.corrective_notice_answered_at) return false;
  if (isLegacyClaim(claim)) return true;
  return claim.corrective_notice_required === true && UNFILED.has(claim.status);
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
  const legacy = wasShownAsFiled(claim);
  const notice = needsCorrectiveNotice(claim);
  const passed = settlement?.deadlinePassed ?? false;
  const base = { legacy, confirmationNumber: number, showNotice: false };
  const unfiled = (kind: ClaimKind, label: string, tone: ClaimTone): ClaimDisplay => ({
    ...base,
    kind,
    label,
    tone: passed ? 'gray' : tone,
    group: passed ? 'closed' : 'needs_filing',
    showNotice: notice,
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
        ? { ...base, kind: 'self_file', label: 'Not reported filed', tone: 'gray', group: 'closed', showNotice: notice }
        : { ...base, kind: 'self_file', label: 'Not filed yet', tone: 'amber', group: 'needs_filing', showNotice: notice };
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
      return {
        ...base,
        kind: 'not_reported_filed',
        label: 'Not reported filed',
        tone: 'gray',
        group: 'closed',
        showNotice: notice,
      };
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
  const unreported = UNFILED.has(claim.status);
  return {
    // A claim the old flow showed as filed can always be answered (D42), also
    // after the D38 correction moved it to self_file; others within the late
    // window.
    reportFiled: legacy || (unreported && (claim.corrective_notice_required === true || ctx.lateReportOpen)),
    addConfirmation: claim.status === 'reported_filed',
    correctConfirmation: claim.status === 'submitted' && !legacy,
    undoReport: claim.status === 'reported_filed',
    answerCorrectiveNotice: legacy || needsCorrectiveNotice(claim),
    acknowledgeFictional: false,
  };
}

/**
 * Where a claim the old flow showed as filed stands, for the corrective
 * notice's "Haven't filed yet?" line (D41): it may say "you still can" only
 * while our list shows the settlement open. A settlement our list marks
 * closed, or no longer lists, is being re-checked, so people are sent to the
 * official site to see whether it still takes claims.
 */
export type LegacyFilingState = 'open' | 'closed_on_list' | 'unlisted' | 'deadline_passed';

export function legacyFilingState(settlement: SettlementContext): LegacyFilingState {
  if (settlement.deadlinePassed) return 'deadline_passed';
  if (settlement.closedByStatus) return 'closed_on_list';
  if (settlement.known && !settlement.published) return 'unlisted';
  return 'open';
}

/** The dashboard's next step for a claim with an open corrective notice. */
export function legacyNextStep(state: LegacyFilingState): string {
  switch (state) {
    case 'deadline_passed':
      return 'ClaimMatch did not file this. If you filed before the deadline, tell us.';
    case 'closed_on_list':
      return "ClaimMatch did not file this. Our list shows it as closed and we're re-checking it. Check the official site, or tell us if you already filed.";
    case 'unlisted':
      return "ClaimMatch did not file this. We're re-checking this settlement. Check the official site, or tell us if you already filed.";
    case 'open':
      return 'ClaimMatch did not file this. File on the official site, or tell us if you already did.';
  }
}

/**
 * The last day a late "I filed it" is accepted, or null when there is no
 * limit: no deadline, or a claim the old flow showed as filed (D42).
 */
export function reportByDay(claim: ClaimFields, deadline: string | null | undefined): string | null {
  return wasShownAsFiled(claim) ? null : lateReportLastDay(deadline);
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
  // Any answer to an open corrective notice records that it was answered.
  const answersNotice = needsCorrectiveNotice(claim);
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
      if (answersNotice) changes.corrective_notice_answered_at = at;
      return plan(changes, {
        action: 'report_filed',
        with_confirmation_number: Boolean(number),
        filed_on: filedOn,
        legacy: wasShownAsFiled(claim),
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
      const changes: ClaimChanges = { corrective_notice_answered_at: claim.corrective_notice_answered_at ?? at };
      // A legacy status must be left (the 0006 CHECK); a claim the D38
      // correction already moved keeps its status.
      if (legacy) changes.status = 'self_file';
      return plan(changes, { action: 'acknowledge_notice', answer: 'not_filed_yet' });
    }
    case 'withdraw': {
      if (from === 'withdrawn') return NOOP;
      if (from !== 'self_file' && !legacy) {
        return refuse('not_allowed', "A claim you've reported filed can't be withdrawn here.");
      }
      const changes: ClaimChanges = { status: 'withdrawn' };
      if (answersNotice) changes.corrective_notice_answered_at = at;
      return plan(changes, { action: 'withdraw' });
    }
  }
}

