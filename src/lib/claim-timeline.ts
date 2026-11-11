/**
 * After-you-file timeline for a claim the user marked submitted.
 * Hearing date and payment timing come only from the settlement record.
 * Unknown values stay "Not announced yet". Never guess a date.
 */
import { parseCalendarDate } from './claim-deadlines';
import { displayConfirmationNumber, hasConfirmationNumber } from './claims';
import { formatDeadline } from './utils';

export const UNKNOWN_ANNOUNCED = 'Not announced yet';
export const CONFIRMATION_MISSING = 'Not added yet';

export type ClaimTimelineStepId = 'submitted' | 'confirmation' | 'hearing' | 'payment';

export interface ClaimTimelineStep {
  id: ClaimTimelineStepId;
  label: string;
  value: string;
  known: boolean;
}

export interface ClaimTimelineView {
  steps: ClaimTimelineStep[];
}

export interface ClaimTimelineInput {
  status: string;
  confirmation_number?: string | null;
  user_filed_on?: string | null;
  reported_filed_at?: string | null;
  final_approval_hearing_at?: string | null;
  payment_timing_text?: string | null;
}

/** True when the user self-reported filing (not a legacy unconfirmed submitted row). */
export function isUserReportedSubmitted(claim: {
  status: string;
  confirmation_number?: string | null;
}): boolean {
  if (claim.status === 'reported_filed') return true;
  return claim.status === 'submitted' && hasConfirmationNumber(claim);
}

/** Format a stored date. Null, blank, or unparseable → "Not announced yet". */
export function announcedDateLabel(value: string | null | undefined): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return UNKNOWN_ANNOUNCED;
  const ymd = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  const label = formatDeadline(ymd);
  if (!label || label === 'Varies') return UNKNOWN_ANNOUNCED;
  return label;
}

/** User-reported submitted date. Prefers the date they typed over the save stamp. */
export function submittedDateLabel(claim: {
  user_filed_on?: string | null;
  reported_filed_at?: string | null;
}): string {
  return announcedDateLabel(claim.user_filed_on || claim.reported_filed_at || null);
}

export function confirmationLabel(claim: { confirmation_number?: string | null }): string {
  if (!hasConfirmationNumber(claim) || !claim.confirmation_number) return CONFIRMATION_MISSING;
  return displayConfirmationNumber(claim.confirmation_number);
}

export function paymentTimingLabel(value: string | null | undefined): string {
  if (typeof value !== 'string') return UNKNOWN_ANNOUNCED;
  const text = value.trim();
  return text || UNKNOWN_ANNOUNCED;
}

export function buildClaimTimeline(input: ClaimTimelineInput): ClaimTimelineView | null {
  if (!isUserReportedSubmitted(input)) return null;

  const submitted = submittedDateLabel(input);
  const confirmation = confirmationLabel(input);
  const hearing = announcedDateLabel(input.final_approval_hearing_at);
  const payment = paymentTimingLabel(input.payment_timing_text);

  return {
    steps: [
      {
        id: 'submitted',
        label: 'You submitted',
        value: submitted,
        known: submitted !== UNKNOWN_ANNOUNCED,
      },
      {
        id: 'confirmation',
        label: 'Confirmation number',
        value: confirmation,
        known: confirmation !== CONFIRMATION_MISSING,
      },
      {
        id: 'hearing',
        label: 'Final approval hearing',
        value: hearing,
        known: hearing !== UNKNOWN_ANNOUNCED,
      },
      {
        id: 'payment',
        label: 'When payments go out',
        value: payment,
        known: payment !== UNKNOWN_ANNOUNCED,
      },
    ],
  };
}
