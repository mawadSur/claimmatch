/**
 * One-click filing: statuses, the claim state machine, lanes, limits and
 * error codes. CONTRACT (read-only for builders). Import from ./contract.ts,
 * which re-exports this file; it is split out only to keep files short.
 * Relative imports only, so the native app can share it later.
 */
import { AGENT_CHANNELS, UuidSchema, type AgentChannel } from './contract-spec';

/** Raised only when a response changes in a way older app builds cannot read. */
export const FILING_API_VERSION = 1;
export const PACKET_FORMAT = 'claimmatch.packet.v1';

/* -------------------------------------------------------------------------- */
/* Claim statuses and the state machine                                       */
/* -------------------------------------------------------------------------- */

/** claim_status values added by 0037 for the agent lanes ('rejected' is legacy, hence filing_rejected). */
export const AGENT_CLAIM_STATUSES = [
  'preparing',
  'ready',
  'signed',
  'queued',
  'filing',
  'filed_by_claimmatch',
  'needs_you',
  'filing_rejected',
] as const;
export type AgentClaimStatus = (typeof AGENT_CLAIM_STATUSES)[number];

/** Every status this API reports. self_file and later are the existing self-file states (0006). */
export const FILING_CLAIM_STATUSES = [
  ...AGENT_CLAIM_STATUSES,
  'self_file',
  'reported_filed',
  'submitted',
  'not_reported_filed',
  'withdrawn',
] as const;
export type FilingClaimStatus = (typeof FILING_CLAIM_STATUSES)[number];

/**
 * Allowed moves into, out of and between agent-lane statuses. Mirrors
 * public.filing_claim_transition_allowed (0038), which enforces it; change
 * both together. '' is "no claim yet". Moves among self-file statuses keep
 * their existing rules (src/lib/claims.ts).
 */
export const CLAIM_TRANSITIONS: Readonly<Record<string, readonly FilingClaimStatus[]>> = {
  '': ['preparing'],
  self_file: ['preparing', 'ready'],
  preparing: ['ready', 'self_file', 'withdrawn'],
  ready: ['preparing', 'signed', 'self_file', 'withdrawn'],
  signed: ['queued', 'preparing', 'ready', 'needs_you', 'self_file', 'withdrawn'],
  queued: ['filing', 'preparing', 'ready', 'needs_you', 'self_file', 'withdrawn'],
  filing: ['queued', 'filed_by_claimmatch', 'submitted', 'filing_rejected', 'needs_you', 'self_file'],
  filed_by_claimmatch: ['submitted', 'filing_rejected'],
  needs_you: ['preparing', 'ready', 'self_file', 'withdrawn'],
  filing_rejected: ['self_file', 'withdrawn'],
};

export function canMoveClaim(from: string | null, to: FilingClaimStatus): boolean {
  return (CLAIM_TRANSITIONS[from ?? ''] ?? []).includes(to);
}

/** Deadline reminders still go out for these (the member has something to do). */
export const REMINDER_AGENT_STATUSES = ['preparing', 'ready', 'needs_you'] as const;
/** "Signed or further along": reminders never go out for these. */
export const NO_REMINDER_STATUSES = [
  'signed',
  'queued',
  'filing',
  'filed_by_claimmatch',
  'filing_rejected',
  'reported_filed',
  'submitted',
  'withdrawn',
] as const;

export const PACKET_STATUSES = ['open', 'signed', 'closed'] as const;
export type PacketStatus = (typeof PACKET_STATUSES)[number];

export const JOB_STATUSES = ['queued', 'in_progress', 'exported', 'needs_attention', 'filed', 'rejected', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
/** At most one job per claim is in one of these (unique index, 0037). */
export const OPEN_JOB_STATUSES = ['queued', 'in_progress', 'exported', 'needs_attention'] as const;

export const DOCUMENT_STATUSES = ['pending_upload', 'stored', 'rejected', 'deleted'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Lanes                                                                      */
/* -------------------------------------------------------------------------- */

/** Where a claim goes: an agent channel ("on our side") or the member finishes on the official site. */
export const LANES = [...AGENT_CHANNELS, 'self_file'] as const;
export type Lane = (typeof LANES)[number];
export function isAgentLane(lane: Lane): lane is AgentChannel {
  return lane !== 'self_file';
}

/** Why an agent lane was not chosen (staff console). Order: docs section 8. */
export const LANE_REASON_CODES = [
  'settlement_not_open',
  'kill_switch',
  'objection_received',
  'no_settlement_policy',
  'agent_filing_unknown',
  'agent_filing_prohibited',
  'administrator_prohibits',
  'identity_check_unavailable',
  'no_approved_spec',
  'agent_certification_not_allowed',
  'state_not_covered',
  'health_consent_unavailable',
  'health_consent_declined',
  'no_channel_enabled',
  'deadline_too_close',
  'channel_config_invalid',
  'channel_cannot_carry_documents',
  'form_has_challenge',
  'desk_at_capacity',
  'email_not_configured',
] as const;
export type LaneReasonCode = (typeof LANE_REASON_CODES)[number];

/** What a member may be told. Disputes, kill switches and staffing are never shown. */
export const MEMBER_LANE_REASONS = [
  'not_offered_for_settlement',
  'settlement_not_open',
  'deadline_too_close',
  'state_not_covered',
  'health_consent_needed',
  'proof_not_supported',
] as const;
export type MemberLaneReason = (typeof MEMBER_LANE_REASONS)[number];

export const MEMBER_LANE_REASON_OF: Readonly<Record<LaneReasonCode, MemberLaneReason>> = {
  settlement_not_open: 'settlement_not_open',
  kill_switch: 'not_offered_for_settlement',
  objection_received: 'not_offered_for_settlement',
  no_settlement_policy: 'not_offered_for_settlement',
  agent_filing_unknown: 'not_offered_for_settlement',
  agent_filing_prohibited: 'not_offered_for_settlement',
  administrator_prohibits: 'not_offered_for_settlement',
  identity_check_unavailable: 'not_offered_for_settlement',
  no_approved_spec: 'not_offered_for_settlement',
  agent_certification_not_allowed: 'not_offered_for_settlement',
  state_not_covered: 'state_not_covered',
  health_consent_unavailable: 'not_offered_for_settlement',
  health_consent_declined: 'health_consent_needed',
  no_channel_enabled: 'not_offered_for_settlement',
  deadline_too_close: 'deadline_too_close',
  channel_config_invalid: 'not_offered_for_settlement',
  channel_cannot_carry_documents: 'proof_not_supported',
  form_has_challenge: 'not_offered_for_settlement',
  desk_at_capacity: 'not_offered_for_settlement',
  email_not_configured: 'not_offered_for_settlement',
};

/* -------------------------------------------------------------------------- */
/* Limits, auth and headers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * "File my claim" needs a real sign-in this recent (amr timestamp in the access token).
 * filing_sign_packet (0039) checks both constants again (CM015); a test keeps them equal.
 */
export const REAUTH_MAX_AGE_SECONDS = 15 * 60;
/** amr methods that count. Email links (otp, magiclink, recovery, invite) never do: see match-alert-start.ts. */
export const FRESH_SIGN_IN_METHODS = ['password', 'oauth', 'sso/saml', 'totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn'] as const;

/**
 * For comparing the typed signature with the packet's legal name: NFC,
 * trimmed, inner whitespace collapsed to one space, lower-cased. Shared by
 * the sign route (B2) and Jev's global.signature_binding (B1), so both agree.
 */
export function normalizeTypedName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
/** Required on POST .../sign (a UUID); optional elsewhere, where repeats are no-ops by state. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IdempotencyKeySchema = UuidSchema;

export const CLAIM_DOCUMENTS_BUCKET = 'claim-documents';
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_CLAIM = 20;
export const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
/** Member uploads are deleted this long after the claim's final status (law firm to confirm). */
export const DOCUMENT_RETENTION_DAYS = 90;
export const MAX_ANSWER_KEYS = 60;

/** rateLimit(`${key}:${userId}`, { limit, windowMs }) from src/lib/ratelimit.ts. */
export const FILING_RATE_LIMITS = {
  read: { key: 'filing-read', limit: 60, windowMs: 60_000 },
  write: { key: 'filing-write', limit: 60, windowMs: 60_000 },
  documents: { key: 'filing-docs', limit: 20, windowMs: 60_000 },
  sign: { key: 'filing-sign', limit: 5, windowMs: 10 * 60_000 },
  action: { key: 'filing-action', limit: 10, windowMs: 60_000 },
  staff: { key: 'filing-staff', limit: 120, windowMs: 60_000 },
  desk_next: { key: 'filing-desk-next', limit: 30, windowMs: 60_000 },
  bulk_export: { key: 'filing-bulk', limit: 10, windowMs: 60 * 60_000 },
} as const;

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export const FILING_ERROR_CODES = [
  'not_found',
  'unauthorized',
  'auth_unavailable',
  'forbidden',
  'role_required',
  'rate_limited',
  'unsupported_media_type',
  'invalid_request',
  'service_unavailable',
  'settlement_closed',
  'settlement_unavailable',
  'already_filed',
  'lane_unavailable',
  'packet_locked',
  'revision_conflict',
  'packet_changed',
  'jev_blocked',
  'reauth_required',
  'esign_consent_required',
  'typed_name_mismatch',
  'health_consent_required',
  'not_collected',
  'document_limit',
  'document_invalid',
  'upload_incomplete',
  'idempotency_key_required',
  'idempotency_conflict',
  'invalid_transition',
  'filing_in_progress',
  'lock_lost',
  'spec_invalid',
  'not_draft',
] as const;
export type FilingErrorCode = (typeof FILING_ERROR_CODES)[number];

/** reauth_required is 403, never 401: the app signs people out on 401. */
export const FILING_ERROR_HTTP: Readonly<Record<FilingErrorCode, number>> = {
  not_found: 404,
  unauthorized: 401,
  auth_unavailable: 503,
  forbidden: 403,
  role_required: 403,
  rate_limited: 429,
  unsupported_media_type: 415,
  invalid_request: 400,
  service_unavailable: 503,
  settlement_closed: 409,
  settlement_unavailable: 503,
  already_filed: 409,
  lane_unavailable: 409,
  packet_locked: 409,
  revision_conflict: 409,
  packet_changed: 409,
  jev_blocked: 422,
  reauth_required: 403,
  esign_consent_required: 409,
  typed_name_mismatch: 422,
  health_consent_required: 422,
  not_collected: 422,
  document_limit: 409,
  document_invalid: 422,
  upload_incomplete: 409,
  idempotency_key_required: 400,
  idempotency_conflict: 409,
  invalid_transition: 409,
  filing_in_progress: 409,
  lock_lost: 409,
  spec_invalid: 422,
  not_draft: 409,
};

export const FILING_ERROR_MESSAGES: Readonly<Record<FilingErrorCode, string>> = {
  not_found: 'We couldn’t find that.',
  unauthorized: 'Please log in again.',
  auth_unavailable: 'We couldn’t confirm you’re logged in right now. Please try again in a minute.',
  forbidden: 'You don’t have access to this.',
  role_required: 'This needs a different staff role.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  unsupported_media_type: 'Send the request as JSON.',
  invalid_request: 'Something in the request isn’t right. Check it and try again.',
  service_unavailable: 'Something went wrong on our side. Please try again in a minute.',
  settlement_closed: 'This settlement is closed to new claims. Check the official site to be sure.',
  settlement_unavailable: 'We couldn’t load this settlement right now. Please try again.',
  already_filed: 'This claim has already been sent or reported, so it can’t be started again here.',
  lane_unavailable: 'This claim can’t be sent from Lawsuit AI right now. You can finish it on the official site.',
  packet_locked: 'You signed this claim, so it can’t be changed. Reopen it to make changes, then sign again.',
  revision_conflict: 'This claim changed in another tab or device. Refresh and try again.',
  packet_changed: 'Your answers changed since you reviewed them. Review them again, then sign.',
  jev_blocked: 'Some answers need attention before you can sign.',
  reauth_required: 'For your security, sign in again with your password, then sign.',
  esign_consent_required: 'Please agree to use electronic records and signatures first.',
  typed_name_mismatch: 'Type your full legal name exactly as it appears on this claim.',
  health_consent_required: 'This asks for health information. Agree to share it first, or finish on the official site.',
  not_collected: 'Lawsuit AI doesn’t collect this. Enter it on the official site.',
  document_limit: 'You’ve reached the upload limit for this claim.',
  document_invalid: 'That file can’t be used. Upload a JPG, PNG, HEIC, WebP or PDF up to 10 MB.',
  upload_incomplete: 'The upload didn’t finish. Please try again.',
  idempotency_key_required: 'Something went wrong. Please try again.',
  idempotency_conflict: 'This request was already used for something else. Refresh and try again.',
  invalid_transition: 'That change isn’t possible for this claim right now. Refresh and try again.',
  filing_in_progress: 'This claim is being worked on right now. You can make changes once that’s done.',
  lock_lost: 'Someone else has this job now. Take the next one.',
  spec_invalid: 'The spec has problems. Fix the listed fields.',
  not_draft: 'Only a draft can be changed. Start a new draft.',
};

/** Database errors of 0038 to 0040 (and a few Postgres ones), as API codes. */
export const FILING_DB_ERRORS: Readonly<Record<string, FilingErrorCode>> = {
  CM001: 'invalid_transition',
  CM002: 'packet_locked',
  CM003: 'packet_changed',
  CM004: 'invalid_transition',
  CM005: 'filing_in_progress',
  CM006: 'role_required',
  CM007: 'not_draft',
  CM008: 'idempotency_conflict',
  CM009: 'packet_changed',
  CM010: 'packet_changed',
  CM011: 'esign_consent_required',
  CM012: 'lane_unavailable',
  CM013: 'invalid_transition',
  CM014: 'invalid_request',
  CM015: 'reauth_required',
  P0002: 'not_found',
  '22023': 'invalid_request',
  '23505': 'invalid_transition',
  '40001': 'revision_conflict',
};
