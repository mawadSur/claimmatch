/**
 * Staff-facing labels for the filing console. Plain English, copy-guard safe
 * (tests/copy-guard.test.ts scans this file): no "we file", no "filed by"
 * phrasing; the status identifiers themselves stay in code only.
 */
import type {
  AgentChannel,
  AgentFiling,
  DocumentMime,
  JobStatus,
  Lane,
  LaneReasonCode,
  MemberField,
  OfficialFormChallenge,
  PolicyStatus,
  QuestionType,
  SourceReviewed,
  SpecStatus,
} from '@/lib/filing/v2/contract';
import type { RecordResultRequest } from '@/lib/filing/v2/contract-staff';

export const JOB_STATUS_LABEL: Readonly<Record<JobStatus, string>> = {
  queued: 'Queued',
  in_progress: 'In progress',
  exported: 'In a bulk export',
  needs_attention: 'Needs attention',
  filed: 'Filed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const CHANNEL_LABEL: Readonly<Record<AgentChannel, string>> = {
  filing_desk: 'Filing desk',
  administrator_email: 'Administrator email',
  administrator_bulk: 'Administrator bulk file',
  administrator_api: 'Administrator API',
};

export const LANE_LABEL: Readonly<Record<Lane, string>> = {
  ...CHANNEL_LABEL,
  self_file: 'Self-file (member finishes on the official site)',
};

export const AGENT_FILING_LABEL: Readonly<Record<AgentFiling, string>> = {
  unknown: 'Unknown (members self-file)',
  allowed: 'Allowed',
  prohibited: 'Prohibited',
};

export const VERSION_STATUS_LABEL: Readonly<Record<PolicyStatus | SpecStatus, string>> = {
  draft: 'Draft',
  approved: 'Approved',
  superseded: 'Superseded',
  rejected: 'Rejected',
  retired: 'Retired',
};

/** Why an agent lane was passed over (staff only; members see MEMBER_LANE_REASON_OF). */
export const LANE_REASON_LABEL: Readonly<Record<LaneReasonCode, string>> = {
  settlement_not_open: 'Settlement not open for claims',
  kill_switch: 'Kill switch on',
  objection_received: 'Objection received',
  no_settlement_policy: 'No approved settlement policy',
  agent_filing_unknown: 'Agent filing not decided (unknown)',
  agent_filing_prohibited: 'Agent filing prohibited',
  administrator_prohibits: 'Administrator prohibits agent filing',
  identity_check_unavailable: 'Identity check required, and no identity vendor exists yet',
  no_approved_spec: 'No approved filing spec',
  agent_certification_not_allowed: 'Form makes the submitter certify facts, and the policy does not allow it',
  state_not_covered: 'Member’s state not covered',
  health_consent_unavailable: 'Health consent text missing',
  health_consent_declined: 'Member did not give health consent',
  no_channel_enabled: 'No channel enabled',
  deadline_too_close: 'Past the channel’s cutoff before the deadline',
  channel_config_invalid: 'Channel settings incomplete or not supported',
  channel_cannot_carry_documents: 'Channel cannot carry the proof this claim needs',
  form_has_challenge: 'Official form shows a check, so the desk stays off',
  desk_at_capacity: 'Filing desk at capacity',
  email_not_configured: 'Email sending not set up',
};

/** claims.status as staff read it. Unknown legacy values show as they are. */
const CLAIM_STATUS_LABEL: Readonly<Record<string, string>> = {
  preparing: 'Member preparing',
  ready: 'Ready for the member to sign',
  signed: 'Signed by the member',
  queued: 'Queued',
  filing: 'Filing in progress',
  filed_by_claimmatch: 'Filed, waiting for the confirmation number',
  needs_you: 'Back with the member',
  filing_rejected: 'Rejected by the administrator',
  self_file: 'Self-file',
  reported_filed: 'Member reported filing',
  submitted: 'Submitted, with a confirmation number',
  not_reported_filed: 'Not reported',
  withdrawn: 'Withdrawn',
};

export function claimStatusLabel(status: string): string {
  return CLAIM_STATUS_LABEL[status] ?? status;
}

export const QUESTION_TYPE_LABEL: Readonly<Record<QuestionType, string>> = {
  text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  integer: 'Whole number',
  decimal: 'Decimal number',
  money: 'Money amount',
  yes_no: 'Yes or no',
  single_choice: 'One choice',
  multi_choice: 'Several choices',
  us_state: 'US state',
  zip: 'ZIP code',
  vin: 'Vehicle VIN',
  notice_id: 'Notice or claim ID (typed by the member)',
};

export const MEMBER_FIELD_LABEL: Readonly<Record<MemberField, string>> = {
  legal_name: 'Full legal name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  'address.line1': 'Address line 1',
  'address.line2': 'Address line 2',
  'address.city': 'City',
  'address.state': 'State',
  'address.zip': 'ZIP code',
};

export const CHALLENGE_LABEL: Readonly<Record<OfficialFormChallenge, string>> = {
  captcha: 'CAPTCHA or other bot check',
  email_code: 'Code sent by email',
  sms_code: 'Code sent by text message',
  identity_check: 'Identity check',
  account_login: 'Account login',
};

export const SOURCE_KIND_LABEL: Readonly<Record<SourceReviewed['kind'], string>> = {
  settlement_agreement: 'Settlement agreement',
  court_order: 'Court order',
  long_form_notice: 'Long-form notice',
  claim_form: 'Claim form',
  administrator_letter: 'Administrator letter',
  administrator_terms: 'Administrator terms',
  website_terms: 'Website terms',
  other: 'Other',
};

export const MIME_LABEL: Readonly<Record<DocumentMime, string>> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
};

export type ResultOutcome = RecordResultRequest['outcome'];

/** The desk's result choices, in the order the form lists them. */
export const RESULT_OUTCOMES: ReadonlyArray<{ value: ResultOutcome; label: string; help: string }> = [
  {
    value: 'filed',
    label: 'Submitted on the official site',
    help: 'Upload a screenshot of the confirmation page. Add the confirmation number if the site showed one.',
  },
  {
    value: 'rejected',
    label: 'The official site refused it',
    help: 'Say why. The member is told to finish on the official site.',
  },
  {
    value: 'not_submitted',
    label: 'Not submitted: put it back in the queue',
    help: 'Only when nothing was sent. Someone takes it again later.',
  },
  {
    value: 'needs_member',
    label: 'Not submitted: the member must fix or add something',
    help: 'Nothing was sent. The member’s signature ends, and they fix it and sign again.',
  },
  {
    value: 'stopped_at_challenge',
    label: 'Stopped at a check (CAPTCHA, code, identity check or login)',
    help: 'Do not solve it or ask anyone to. The member finishes on the official site.',
  },
  {
    value: 'needs_attention',
    label: 'Not sure whether it went through',
    help: 'Never submit it again. A person checks with the administrator before anything else happens.',
  },
];

export type Resolution = 'requeue_not_submitted' | 'filed' | 'rejected' | 'hand_back_to_member';

export const RESOLUTIONS: ReadonlyArray<{ value: Resolution; label: string }> = [
  { value: 'filed', label: 'Checked: it went through' },
  { value: 'rejected', label: 'Checked: the administrator refused it' },
  { value: 'requeue_not_submitted', label: 'Checked: nothing was sent, put it back in the queue' },
  { value: 'hand_back_to_member', label: 'Hand it back to the member' },
];

/** Suggested reason codes (lowercase). Codes for needs_member reach the member, so keep them plain. */
export const REASON_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  needs_member: ['missing_information', 'proof_unreadable', 'proof_does_not_match', 'details_do_not_match', 'address_not_accepted'],
  rejected: ['administrator_refused', 'duplicate_claim', 'not_in_class', 'form_closed', 'deadline_passed'],
  needs_attention: ['unsure_if_submitted', 'site_error_after_submit', 'session_timed_out'],
  stopped_at_challenge: ['captcha', 'email_code', 'sms_code', 'identity_check', 'account_login'],
  resolve: ['checked_with_administrator', 'checked_official_site', 'member_must_fix', 'duplicate_claim'],
};
