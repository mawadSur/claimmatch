/**
 * Generic “what is still missing for this settlement’s filing spec.”
 * Used by the missing-info step before desk enqueue. Notice ID is per-claim,
 * never stored on the shared profile. Official-site PINs stay out unless
 * COLLECT_ADMIN_PIN_ENABLED is on (default off; needs counsel + security).
 */
import { flags } from '../../flags';
import {
  currentAddressOf,
  type ClaimProfile,
  type ClaimProfileFieldKey,
} from '../../claim-profile';
import type { FilingSpecContent } from './contract-spec';

export interface SpecField {
  key: string;
  label: string;
  path: string;
  kind: 'text' | 'choice' | 'date' | 'email' | 'phone';
  required: boolean;
  help: string;
}

export interface MissingField {
  /** Packet answer key or member path. */
  key: string;
  label: string;
  help: string;
  required: boolean;
  /** Shared-profile field this maps to, if any. Notice IDs never map. */
  profileKey: ClaimProfileFieldKey | null;
  /** True when this is the mailed notice / claim ID, not a login PIN. */
  isNoticeId: boolean;
  /** True only when the (off by default) PIN flag is on — should stay rare. */
  isAdminPin: boolean;
  kind: SpecField['kind'] | 'text';
}

const NOTICE_ID_KEYS = new Set([
  'notice_id',
  'notice_number',
  'claim_id',
  'claim_number',
  'class_member_id',
  'unique_id',
  'control_number',
]);

const PIN_KEYS = new Set(['pin', 'password', 'passcode', 'otp', 'one_time_code', 'login_pin']);

function looksLikeNoticeId(field: SpecField): boolean {
  const hay = `${field.key} ${field.label} ${field.path}`.toLowerCase();
  if (NOTICE_ID_KEYS.has(field.key.toLowerCase())) return true;
  return /\bnotice\s*id\b|\bclaim\s*id\b|\bclaim\s*number\b|\bcontrol\s*number\b/.test(hay);
}

function looksLikeAdminPin(field: SpecField): boolean {
  const hay = `${field.key} ${field.label} ${field.path}`.toLowerCase();
  if (PIN_KEYS.has(field.key.toLowerCase())) return true;
  return /\b(login\s*)?(pin|password|passcode|otp)\b/.test(hay) && !looksLikeNoticeId(field);
}

export function profileKeyForSpecField(field: SpecField): ClaimProfileFieldKey | null {
  switch (field.path) {
    case 'member.legal_name':
      return 'legal_name';
    case 'member.email':
      return 'email';
    case 'member.phone':
      return 'phone';
    case 'member.address.line1':
      return 'address.line1';
    case 'member.address.line2':
      return 'address.line2';
    case 'member.address.city':
      return 'address.city';
    case 'member.address.state':
      return 'address.state';
    case 'member.address.zip':
      return 'address.zip';
    case 'payout_method':
      return 'payout_preference';
    default:
      break;
  }
  const key = field.key.toLowerCase();
  if (key === 'vin' || key === 'vehicle_vin') return 'vehicle_vin';
  if (key === 'aliases' || key === 'prior_names' || key === 'former_name') return 'aliases';
  if (key === 'date_of_birth' || key === 'dob') return 'date_of_birth';
  if (key === 'account_email' || key === 'subscription_email') return 'account_emails';
  if (key === 'lived_from' || key === 'address_from') return 'address.lived_from';
  return null;
}

function profileHas(profile: ClaimProfile, key: ClaimProfileFieldKey | null): boolean {
  if (!key) return false;
  const current = currentAddressOf(profile);
  switch (key) {
    case 'legal_name':
      return Boolean(profile.legal_name?.trim());
    case 'aliases':
      return Boolean(profile.aliases?.trim());
    case 'email':
      return Boolean(profile.email?.trim());
    case 'phone':
      return Boolean(profile.phone?.trim());
    case 'date_of_birth':
      return Boolean(profile.date_of_birth);
    case 'payout_preference':
      return Boolean(profile.payout_preference);
    case 'vehicle_vin':
      return Boolean(profile.vehicle_vin);
    case 'account_emails':
      return profile.account_emails.length > 0;
    case 'address.line1':
      return Boolean(current?.line1?.trim());
    case 'address.line2':
      return Boolean(current?.line2?.trim());
    case 'address.city':
      return Boolean(current?.city?.trim());
    case 'address.state':
      return Boolean(current?.state?.trim());
    case 'address.zip':
      return Boolean(current?.zip?.trim());
    case 'address.lived_from':
      return Boolean(current?.lived_from);
    case 'prior_addresses':
      return profile.addresses.some((a) => a.kind === 'prior');
    default:
      return false;
  }
}

function packetHas(answers: Record<string, string>, field: SpecField): boolean {
  const value = answers[field.key]?.trim();
  if (value) return true;
  if (field.path.startsWith('member.') || field.path === 'payout_method') {
    return profileHas(
      {
        legal_name: answers['legal_name'] ?? null,
        aliases: answers['aliases'] ?? null,
        email: answers['email'] ?? null,
        phone: answers['phone'] ?? null,
        date_of_birth: answers['date_of_birth'] ?? null,
        payout_preference: (answers['payout_method'] as ClaimProfile['payout_preference']) ?? null,
        vehicle_vin: answers['vin'] ?? answers['vehicle_vin'] ?? null,
        account_emails: [],
        addresses: [],
        consent_at: null,
      },
      profileKeyForSpecField(field),
    );
  }
  return false;
}

function toMissing(field: SpecField, extra?: Partial<MissingField>): MissingField {
  return {
    key: field.key,
    label: field.label,
    help: field.help,
    required: field.required,
    profileKey: profileKeyForSpecField(field),
    isNoticeId: looksLikeNoticeId(field),
    isAdminPin: looksLikeAdminPin(field),
    kind: field.kind,
    ...extra,
  };
}

const NOTICE_ID_FIELD: SpecField = {
  key: 'notice_id',
  label: 'Notice ID or claim ID',
  path: 'answers.notice_id',
  kind: 'text',
  required: true,
  help: 'The ID printed on the notice the administrator mailed you. Not a login PIN or password.',
};

/**
 * Fields still needed before we can enqueue a desk filing.
 * `needsNoticeId` injects a notice-id prompt even when the spec does not
 * list one (needs_notice_id settlements).
 */
export function missingFieldsForSpec(input: {
  spec: FilingSpecContent | null;
  profile: ClaimProfile;
  answers?: Record<string, string>;
  needsNoticeId?: boolean;
}): MissingField[] {
  const answers = input.answers ?? {};
  const out: MissingField[] = [];
  const fields = fieldsFromSpec(input.spec);

  for (const field of fields) {
    if (!field.required) continue;
    if (looksLikeAdminPin(field) && !flags.collectAdminPin()) continue;
    const profileKey = profileKeyForSpecField(field);
    const filled = (profileKey && profileHas(input.profile, profileKey)) || packetHas(answers, field);
    if (!filled) out.push(toMissing(field));
  }

  const specHasNotice = fields.some(looksLikeNoticeId);
  if (input.needsNoticeId && !specHasNotice && !answers.notice_id?.trim()) {
    out.push(toMissing(NOTICE_ID_FIELD, { isNoticeId: true, profileKey: null }));
  }

  return out;
}

export function fieldsFromSpec(spec: FilingSpecContent | null | undefined): SpecField[] {
  if (!spec) return [];
  const fields: SpecField[] = [];
  for (const member of spec.member_fields ?? []) {
    fields.push({
      key: member.field.replace('.', '_'),
      label: member.official_label,
      path: `member.${member.field}`,
      kind: 'text',
      required: member.required,
      help: '',
    });
  }
  for (const question of spec.questions ?? []) {
    fields.push({
      key: question.key,
      label: question.official_label,
      path: `answers.${question.key}`,
      kind: question.type === 'yes_no' || question.type === 'single_choice' ? 'choice' : 'text',
      required: question.required,
      help: question.help ?? '',
    });
  }
  if ((spec.payout_options ?? []).length > 0) {
    fields.push({
      key: 'payout_method',
      label: 'Payment method',
      path: 'payout_method',
      kind: 'choice',
      required: true,
      help: 'A method name only. Never a PayPal, Venmo, Zelle or bank account number.',
    });
  }
  return fields;
}

export function noticeIdFromAnswers(answers: Record<string, string> | undefined): string | null {
  if (!answers) return null;
  for (const key of NOTICE_ID_KEYS) {
    const value = answers[key]?.trim();
    if (value) return value;
  }
  return answers.notice_id?.trim() || null;
}
