/**
 * Input validation for the claim routes, the claim shape sent to the browser,
 * and small content helpers. Pure functions; re-exported from '@/lib/claims'.
 */
import { z } from 'zod';
import type { ClaimAction } from './claims';
import { parseCalendarDate } from './claim-deadlines';
import { proofStatus } from './proof';
import type { EligibilityCriteria, ProofRequired } from './types';
import { getValidClaimUrl } from './utils';

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

const PROOF_NEED: Record<ProofRequired, ProofNeed> = {
  yes: 'required',
  no: 'none',
  optional: 'optional',
  unknown: 'unknown',
};

/**
 * Proof rule as the source states it, from the catalog's proofStatus so the
 * claim page and the settlement page agree. Unknown never reads as "none".
 */
export function proofNeed(l: { proof_required?: boolean | null; eligibility?: unknown }): ProofNeed {
  const eligibility = (l.eligibility && typeof l.eligibility === 'object' ? l.eligibility : {}) as EligibilityCriteria;
  return PROOF_NEED[proofStatus({ proof_required: l.proof_required === true, eligibility })];
}

/** A link we can show: http(s) only, and not a placeholder host. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  const valid = getValidClaimUrl(url);
  if (!valid) return null;
  try {
    const { protocol } = new URL(valid);
    return protocol === 'https:' || protocol === 'http:' ? valid : null;
  } catch {
    return null;
  }
}

/** "example.org" for "https://www.example.org/claims", or null. */
export function linkHost(url: string | null | undefined): string | null {
  const safe = safeExternalUrl(url);
  if (!safe) return null;
  return new URL(safe).hostname.replace(/^www\./, '');
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
  /** The old flow recorded this claim as filed (ClaimFields.corrective_notice_required). */
  corrective_notice_required: boolean;
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
    // 0008's marker, or the stamps only the retired e-sign and File-all flows
    // wrote (so it also holds before 0008 is applied). Only this boolean
    // reaches the browser, never the stamps.
    corrective_notice_required:
      row.corrective_notice_required === true || row.filed_at != null || row.authorized_at != null,
    created_at: str(row.created_at),
  };
}

/** True when a claims row carries the 0006 columns (the migration has run). */
export function hasSelfFileColumns(row: Record<string, unknown>): boolean {
  return 'confirmation_number' in row && 'reported_filed_at' in row && 'corrective_notice_answered_at' in row;
}

/* -------------------------------------------------------------------------- */
/* Database errors from claim writes                                          */
/* -------------------------------------------------------------------------- */

export type DbError = { code?: string; message?: string } | null | undefined;

/** Errors that mean migration 0006 has not been applied to the database. */
export function isMissingSchemaError(error: DbError): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return true;
  return code === '22P02' && /claim_status/.test(error.message ?? '');
}

export const CLAIMS_UNAVAILABLE_MESSAGE =
  "Claim tracking is being updated, so we couldn't save this. Please try again in a few minutes.";

export const SETTLEMENT_UNAVAILABLE_MESSAGE =
  "We couldn't check this settlement right now, so nothing was saved. Please try again in a minute.";

export interface ClaimWriteFailure {
  status: 404 | 409 | 500 | 503;
  code: string;
  error: string;
  /** Unexpected: log it (code and message only). */
  log: boolean;
}

/** Maps a database error from a claim write to the HTTP answer the route sends. */
export function claimWriteFailure(error: DbError): ClaimWriteFailure {
  if (isMissingSchemaError(error)) {
    return { status: 503, code: 'claims_unavailable', error: CLAIMS_UNAVAILABLE_MESSAGE, log: true };
  }
  switch (error?.code) {
    case '40001':
      return {
        status: 409,
        code: 'claim_changed',
        error: 'This claim just changed, maybe in another tab. Refresh the page and try again.',
        log: false,
      };
    case 'P0002':
      return { status: 404, code: 'not_found', error: "We couldn't find that claim.", log: false };
    case '23503':
      return { status: 404, code: 'not_found', error: "We couldn't find that settlement.", log: false };
    case '23514':
      return {
        status: 409,
        code: 'not_allowed',
        error: "That change isn't possible for this claim. Refresh the page and try again.",
        log: true,
      };
    default:
      return {
        status: 500,
        code: 'error',
        error: 'Something went wrong saving your claim. Please try again.',
        log: true,
      };
  }
}
