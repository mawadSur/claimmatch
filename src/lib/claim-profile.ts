/**
 * Shared claim profile: the fields official claim forms commonly ask for,
 * minus anything Lawsuit AI never stores (SSN, full bank account numbers,
 * routing numbers, PINs, passwords, payment-account handles).
 *
 * Core contact (name, email, phone, current address) stays on profiles so
 * existing prefill keeps working. Extra fields live on claim_profiles and
 * claim_profile_addresses (0051), RLS owner-only.
 */
import { findSecrets } from './jev/formats';
import { US_STATES } from './utils';

export const PAYOUT_PREFERENCES = [
  'check',
  'paypal',
  'venmo',
  'prepaid_card',
  'virtual_card',
  'zelle',
  'other',
] as const;
export type PayoutPreference = (typeof PAYOUT_PREFERENCES)[number];

export const PAYOUT_PREFERENCE_LABELS: Record<PayoutPreference, string> = {
  check: 'Paper check',
  paypal: 'PayPal (account details stay on the official form)',
  venmo: 'Venmo (account details stay on the official form)',
  prepaid_card: 'Prepaid or virtual Mastercard',
  virtual_card: 'Virtual card',
  zelle: 'Zelle (account details stay on the official form)',
  other: 'Another method listed on the official form',
};

export interface ClaimProfileAddress {
  id?: string;
  kind: 'current' | 'prior';
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  lived_from: string | null;
  lived_to: string | null;
}

export interface ClaimProfile {
  legal_name: string | null;
  aliases: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  payout_preference: PayoutPreference | null;
  vehicle_vin: string | null;
  account_emails: string[];
  addresses: ClaimProfileAddress[];
  consent_at: string | null;
}

export type ClaimProfileFieldKey =
  | 'legal_name'
  | 'aliases'
  | 'email'
  | 'phone'
  | 'date_of_birth'
  | 'payout_preference'
  | 'vehicle_vin'
  | 'account_emails'
  | 'address.line1'
  | 'address.line2'
  | 'address.city'
  | 'address.state'
  | 'address.zip'
  | 'address.lived_from'
  | 'prior_addresses';

export interface ClaimProfileFieldDef {
  key: ClaimProfileFieldKey;
  label: string;
  help: string;
  sensitive: boolean;
}

/** Fields the “Build your claim profile” flow collects, in form order. */
export const CLAIM_PROFILE_FIELDS: readonly ClaimProfileFieldDef[] = [
  { key: 'legal_name', label: 'Legal name', help: 'The name on your ID and on most claim forms.', sensitive: false },
  {
    key: 'aliases',
    label: 'Other names you have used',
    help: 'Maiden names, prior married names, or aliases a notice might list. Never include a Social Security number.',
    sensitive: false,
  },
  { key: 'email', label: 'Email we should use on claim forms', help: 'Can differ from the address you sign in with.', sensitive: false },
  { key: 'phone', label: 'Phone', help: 'Optional. Many forms ask for it.', sensitive: false },
  {
    key: 'address.line1',
    label: 'Current street address',
    help: 'Where the administrator should mail a check.',
    sensitive: false,
  },
  { key: 'address.line2', label: 'Apartment, suite or unit', help: 'Optional.', sensitive: false },
  { key: 'address.city', label: 'City', help: '', sensitive: false },
  { key: 'address.state', label: 'State', help: '', sensitive: false },
  { key: 'address.zip', label: 'ZIP code', help: '', sensitive: false },
  {
    key: 'address.lived_from',
    label: 'Lived here since',
    help: 'Optional. Some forms ask when you moved in.',
    sensitive: false,
  },
  {
    key: 'prior_addresses',
    label: 'Prior addresses',
    help: 'Addresses during a class period, with approximate dates. Optional unless a form asks.',
    sensitive: false,
  },
  {
    key: 'date_of_birth',
    label: 'Date of birth',
    help: 'Only if a form needs it. We never ask for a Social Security number.',
    sensitive: true,
  },
  {
    key: 'payout_preference',
    label: 'How you prefer to be paid',
    help: 'A method name only (check, PayPal, Venmo). We never store PayPal, Venmo, Zelle or bank account numbers.',
    sensitive: false,
  },
  {
    key: 'vehicle_vin',
    label: 'Vehicle VIN',
    help: 'Optional. Used on auto settlements. A VIN is 17 characters, with no I, O or Q.',
    sensitive: false,
  },
  {
    key: 'account_emails',
    label: 'Other emails on accounts or subscriptions',
    help: 'Store emails you used with a company, not passwords or login PINs.',
    sensitive: false,
  },
];

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]*$/;
const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyClaimProfile(): ClaimProfile {
  return {
    legal_name: null,
    aliases: null,
    email: null,
    phone: null,
    date_of_birth: null,
    payout_preference: null,
    vehicle_vin: null,
    account_emails: [],
    addresses: [],
    consent_at: null,
  };
}

export function isPayoutPreference(value: string | null | undefined): value is PayoutPreference {
  return typeof value === 'string' && (PAYOUT_PREFERENCES as readonly string[]).includes(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function secretsError(value: string | null | undefined, field: string): string | null {
  if (!value) return null;
  const found = findSecrets(value);
  if (found.ssn || found.bareNine) {
    return `${field}: Lawsuit AI never stores a Social Security number. Remove it.`;
  }
  if (found.bankAccount || found.routing || found.card) {
    return `${field}: Lawsuit AI never stores bank, routing or card numbers. Remove them.`;
  }
  if (found.credential) {
    return `${field}: Lawsuit AI never stores PINs, passwords or one-time codes. Remove them.`;
  }
  return null;
}

export interface ClaimProfileParseResult {
  ok: true;
  profile: ClaimProfile;
  /** Columns to write back onto public.profiles (existing prefill). */
  profilePatch: Record<string, string | null>;
}

export interface ClaimProfileParseError {
  ok: false;
  error: string;
  field?: string;
}

function parseAddress(raw: unknown, kind: 'current' | 'prior'): ClaimProfileAddress | ClaimProfileParseError {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Check the address and try again.', field: 'addresses' };
  }
  const row = raw as Record<string, unknown>;
  const line1 = text(row.line1, 200);
  const city = text(row.city, 120);
  const state = text(row.state, 2)?.toUpperCase() ?? null;
  const zip = text(row.zip, 10);
  if (!line1 || !city || !state || !zip) {
    return { ok: false, error: 'Street, city, state and ZIP are required for each address.', field: 'addresses' };
  }
  if (!STATE_CODES.has(state)) return { ok: false, error: 'Choose a US state.', field: 'address.state' };
  if (!ZIP_RE.test(zip)) return { ok: false, error: 'Use a 5-digit ZIP code.', field: 'address.zip' };
  const livedFrom = text(row.lived_from, 10);
  const livedTo = text(row.lived_to, 10);
  if (livedFrom && !ISO_DATE.test(livedFrom)) return { ok: false, error: 'Use YYYY-MM-DD for address dates.', field: 'address.lived_from' };
  if (livedTo && !ISO_DATE.test(livedTo)) return { ok: false, error: 'Use YYYY-MM-DD for address dates.', field: 'address.lived_to' };
  const blob = [line1, text(row.line2, 200), city, state, zip].join(' ');
  const secret = secretsError(blob, 'Address');
  if (secret) return { ok: false, error: secret, field: 'addresses' };
  return {
    kind,
    id: typeof row.id === 'string' ? row.id : undefined,
    line1,
    line2: text(row.line2, 200),
    city,
    state,
    zip,
    lived_from: livedFrom,
    lived_to: kind === 'current' ? null : livedTo,
  };
}

function parseAccountEmails(raw: unknown): string[] | ClaimProfileParseError {
  if (raw == null) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\n,;]+/)
      : null;
  if (!list) return { ok: false, error: 'Account emails must be a list.', field: 'account_emails' };
  const emails: string[] = [];
  for (const item of list) {
    const value = text(item, 320);
    if (!value) continue;
    if (!EMAIL_RE.test(value)) return { ok: false, error: 'One of the account emails is not valid.', field: 'account_emails' };
    const secret = secretsError(value, 'Account email');
    if (secret) return { ok: false, error: secret, field: 'account_emails' };
    if (!emails.includes(value.toLowerCase())) emails.push(value.toLowerCase());
    if (emails.length > 10) return { ok: false, error: 'You can save up to 10 account emails.', field: 'account_emails' };
  }
  return emails;
}

/** Validate a claim-profile POST body. Unknown keys are dropped. */
export function parseClaimProfileInput(body: unknown): ClaimProfileParseResult | ClaimProfileParseError {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const raw = body as Record<string, unknown>;
  const legalName = text(raw.legal_name, 120);
  const aliases = text(raw.aliases, 200);
  const email = text(raw.email, 320);
  const phone = text(raw.phone, 32);
  const dob = text(raw.date_of_birth, 10);
  const vin = text(raw.vehicle_vin, 17)?.toUpperCase() ?? null;
  const payoutRaw = text(raw.payout_preference, 32);
  const payout = payoutRaw ? payoutRaw.toLowerCase() : null;

  if (legalName) {
    const secret = secretsError(legalName, 'Legal name');
    if (secret) return { ok: false, error: secret, field: 'legal_name' };
  }
  if (aliases) {
    const secret = secretsError(aliases, 'Other names');
    if (secret) return { ok: false, error: secret, field: 'aliases' };
  }
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email.', field: 'email' };
  if (phone && !PHONE_RE.test(phone)) {
    return { ok: false, error: 'Use only numbers, spaces and + - ( ) in your phone number.', field: 'phone' };
  }
  if (dob) {
    if (!ISO_DATE.test(dob)) return { ok: false, error: 'Use YYYY-MM-DD for date of birth.', field: 'date_of_birth' };
    const year = Number(dob.slice(0, 4));
    if (year < 1900 || year > new Date().getUTCFullYear() - 13) {
      return { ok: false, error: 'Check the date of birth.', field: 'date_of_birth' };
    }
  }
  if (payout && !isPayoutPreference(payout)) {
    return { ok: false, error: 'Choose a listed payment method name. We never store account numbers.', field: 'payout_preference' };
  }
  if (vin && !VIN_RE.test(vin)) {
    return { ok: false, error: 'A VIN is 17 characters and never uses I, O or Q.', field: 'vehicle_vin' };
  }

  const emails = parseAccountEmails(raw.account_emails);
  if (!Array.isArray(emails)) return emails;

  const addresses: ClaimProfileAddress[] = [];
  const currentRaw = raw.current_address ?? raw.address;
  if (currentRaw) {
    const parsed = parseAddress(currentRaw, 'current');
    if ('ok' in parsed && parsed.ok === false) return parsed;
    addresses.push(parsed as ClaimProfileAddress);
  }
  if (Array.isArray(raw.prior_addresses)) {
    if (raw.prior_addresses.length > 8) {
      return { ok: false, error: 'You can save up to 8 prior addresses.', field: 'prior_addresses' };
    }
    for (const item of raw.prior_addresses) {
      const parsed = parseAddress(item, 'prior');
      if ('ok' in parsed && parsed.ok === false) return parsed;
      addresses.push(parsed as ClaimProfileAddress);
    }
  }

  const current = addresses.find((a) => a.kind === 'current');
  const profile: ClaimProfile = {
    legal_name: legalName,
    aliases,
    email,
    phone,
    date_of_birth: dob,
    payout_preference: isPayoutPreference(payout) ? payout : null,
    vehicle_vin: vin,
    account_emails: emails,
    addresses,
    consent_at: null,
  };
  return {
    ok: true,
    profile,
    profilePatch: {
      full_name: legalName,
      phone,
      address_line1: current?.line1 ?? null,
      address_line2: current?.line2 ?? null,
      city: current?.city ?? null,
      state: current?.state ?? null,
      zip: current?.zip ?? null,
    },
  };
}

export interface ProfilePrefillSource {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** Merge stored claim_profiles + profiles into one view for the form and prefill. */
export function mergeClaimProfile(
  stored: Partial<ClaimProfile> | null | undefined,
  account: ProfilePrefillSource | null | undefined,
): ClaimProfile {
  const base = emptyClaimProfile();
  const row = stored ?? {};
  // Any one address line on `profiles` is enough to synthesize the current
  // address. Keying this on address_line1 alone dropped city/state/zip from the
  // packet prefill for a member who had only those, and because the packet's
  // member state feeds computeLane it could also push them off the agent lane.
  const fromAccount = [account?.address_line1, account?.city, account?.state, account?.zip].some(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  const current =
    row.addresses?.find((a) => a.kind === 'current') ??
    (fromAccount
      ? {
          kind: 'current' as const,
          line1: account?.address_line1 ?? '',
          line2: account?.address_line2 ?? null,
          city: account?.city ?? '',
          state: account?.state ?? '',
          zip: account?.zip ?? '',
          lived_from: null,
          lived_to: null,
        }
      : null);
  const prior = (row.addresses ?? []).filter((a) => a.kind === 'prior');
  return {
    legal_name: row.legal_name ?? account?.full_name ?? null,
    aliases: row.aliases ?? null,
    email: row.email ?? account?.email ?? null,
    phone: row.phone ?? account?.phone ?? null,
    date_of_birth: row.date_of_birth ?? null,
    payout_preference: row.payout_preference ?? null,
    vehicle_vin: row.vehicle_vin ?? null,
    account_emails: row.account_emails ?? [],
    addresses: current ? [current, ...prior] : prior,
    consent_at: row.consent_at ?? null,
  };
}

export function currentAddressOf(profile: ClaimProfile): ClaimProfileAddress | null {
  return profile.addresses.find((a) => a.kind === 'current') ?? null;
}

/**
 * Split a legal / full name into first and last for forms that ask for them
 * separately. The first word is the first name; the rest is the last name, so
 * multi-word last names like "Van Damme" stay together. A single word fills
 * first name only. Never invents a last name.
 */
export function splitLegalName(name: string | null | undefined): { first_name: string | null; last_name: string | null } {
  const text = typeof name === 'string' ? name.trim() : '';
  if (!text) return { first_name: null, last_name: null };
  const parts = text.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/** Contact fields a packet can prefill, taken from the merged claim profile. */
export function memberPrefillFromClaimProfile(profile: ClaimProfile): {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const current = currentAddressOf(profile);
  const text = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    full_name: text(profile.legal_name),
    email: text(profile.email),
    phone: text(profile.phone),
    address_line1: text(current?.line1),
    address_line2: text(current?.line2),
    city: text(current?.city),
    state: text(current?.state),
    zip: text(current?.zip),
  };
}

/** Map a filing-spec path onto the shared profile, when one exists. */
export function profileValueForSpecPath(profile: ClaimProfile, path: string): string | null {
  const current = currentAddressOf(profile);
  const split = splitLegalName(profile.legal_name);
  switch (path) {
    case 'member.legal_name':
      return profile.legal_name;
    case 'member.first_name':
      return split.first_name;
    case 'member.last_name':
      return split.last_name;
    case 'member.email':
      return profile.email;
    case 'member.phone':
      return profile.phone;
    case 'member.address.line1':
      return current?.line1 ?? null;
    case 'member.address.line2':
      return current?.line2 ?? null;
    case 'member.address.city':
      return current?.city ?? null;
    case 'member.address.state':
      return current?.state ?? null;
    case 'member.address.zip':
      return current?.zip ?? null;
    case 'payout_method':
      return profile.payout_preference;
    case 'answers.vin':
    case 'answers.vehicle_vin':
      return profile.vehicle_vin;
    case 'answers.aliases':
    case 'answers.prior_names':
    case 'answers.former_name':
      return profile.aliases;
    case 'answers.date_of_birth':
    case 'answers.dob':
      return profile.date_of_birth;
    case 'answers.account_email':
    case 'answers.subscription_email':
      return profile.account_emails[0] ?? null;
    default:
      return null;
  }
}
