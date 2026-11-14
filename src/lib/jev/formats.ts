/**
 * Jev's named formats and secret detectors. Pure; no regular expression here
 * can backtrack badly (fixed-width or single-pass shapes only).
 */

/** USPS codes: the 50 states, DC, the territories and freely associated states, and military mail (AA, AE, AP). */
export const USPS_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'AS', 'GU', 'MP', 'PR', 'VI', 'FM', 'MH', 'PW', 'AA', 'AE', 'AP',
] as const;
const STATES = new Set<string>(USPS_STATE_CODES);

export function isUsStateCode(value: string): boolean {
  return STATES.has(value);
}

/** 12345 or 12345-6789 (the packet's own format); 00000 is not a ZIP code. */
export function isZipCode(value: string): boolean {
  return /^\d{5}(?:-\d{4})?$/.test(value) && !value.startsWith('00000');
}

/**
 * A US (NANP) number: 10 digits, or 11 starting with 1, after dropping
 * spaces, dots, dashes, parentheses and a leading +. Area code and exchange
 * start with 2-9 and are not N11; area codes never have 9 in the middle.
 */
export function isUsPhone(value: string): boolean {
  if (value.length > 40 || !/^\+?[\d\s().-]+$/.test(value)) return false;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return false;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const nxx = (part: string) => part[0] >= '2' && part.slice(1) !== '11';
  return nxx(area) && area[1] !== '9' && nxx(exchange);
}

const LOCAL_CHARS = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/** A plain email address: one @, a local part without leading, trailing or double dots, and a dotted domain with a real TLD. */
export function isEmailAddress(value: string): boolean {
  if (value.length > 320) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || !LOCAL_CHARS.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  const labels = domain.split('.');
  if (domain.length > 253 || labels.length < 2) return false;
  if (!labels.every((label) => label.length <= 63 && DOMAIN_LABEL.test(label))) return false;
  const tld = labels[labels.length - 1];
  return /^[A-Za-z]{2,63}$/.test(tld) || /^xn--[A-Za-z0-9-]{2,59}$/.test(tld);
}

/** YYYY-MM-DD naming a real calendar day (no 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** A dollar amount as the packet stores it: "12", "12.3" or "12.34"; no sign, commas or symbols. */
export function isMoneyAmount(value: string): boolean {
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value);
}

/** A decimal string Jev may compare as a number ("12.34", "-3", "7"). */
export function numericValueOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(value)) return Number(value);
  return null;
}

const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Why a VIN is wrong, or null when it is fine: 17 characters, letters and
 * digits without I, O or Q (any case), and the ISO 3779 / 49 CFR 565 check
 * digit in position 9 (0-9 or X), which every vehicle sold in North America has.
 */
export function vinProblem(value: string): 'format' | 'check_digit' | null {
  const vin = value.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return 'format';
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const n = ch >= '0' && ch <= '9' ? Number(ch) : VIN_VALUES[ch];
    sum += n * VIN_WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected ? null : 'check_digit';
}

/** The Luhn (mod 10) check used by payment cards. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Visa, Mastercard, American Express, Discover, JCB, Diners Club and UnionPay number prefixes. */
function hasCardPrefix(digits: string): boolean {
  const p2 = Number(digits.slice(0, 2));
  const p3 = Number(digits.slice(0, 3));
  const p4 = Number(digits.slice(0, 4));
  return (
    digits[0] === '4' ||
    (p2 >= 51 && p2 <= 55) ||
    (p4 >= 2221 && p4 <= 2720) ||
    p2 === 34 ||
    p2 === 37 ||
    p4 === 6011 ||
    p2 === 65 ||
    (p3 >= 644 && p3 <= 649) ||
    (p4 >= 3528 && p4 <= 3589) ||
    (p3 >= 300 && p3 <= 305) ||
    p2 === 36 ||
    p2 === 38 ||
    p2 === 62
  );
}

/** 13 to 19 digits with a card brand prefix that pass the Luhn check. */
export function isCardNumberLike(digits: string): boolean {
  return /^\d{13,19}$/.test(digits) && hasCardPrefix(digits) && luhnValid(digits);
}

/** An ABA routing number: 9 digits, a Federal Reserve prefix and the 3-7-1 checksum. */
export function isRoutingNumberLike(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  const prefix = Number(digits.slice(0, 2));
  const prefixOk = prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80;
  const d = Array.from(digits, Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return prefixOk && sum % 10 === 0;
}

/** Area 001-899 except 666, group 01-99, serial 0001-9999: the shape the SSA issues. */
export function isSsnShape(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  const area = Number(digits.slice(0, 3));
  return area !== 0 && area !== 666 && area < 900 && digits.slice(3, 5) !== '00' && digits.slice(5) !== '0000';
}

export interface SecretFindings {
  /** An SSN written 123-45-6789 or 123 45 6789. */
  ssn: boolean;
  /** A payment card number (Luhn, 13-19 digits, a card brand prefix), spaces or dashes allowed. */
  card: boolean;
  /** A routing number next to the words "routing" or "ABA". */
  routing: boolean;
  /** 8 to 17 digits next to "bank account", "checking", "savings", "routing" or "ABA". */
  bankAccount: boolean;
  /** A PIN, passcode, password, one-time, verification or security code, CVV or OTP followed by a value with a digit. */
  credential: boolean;
  /** The whole value is 9 digits shaped like an SSN or a routing number (could be something else). */
  bareNine: boolean;
}

const SSN_SPACED = /(?<![\d-])(\d{3})([- ])(\d{2})\2(\d{4})(?![\d-])/g;
const CARD_RUN = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
const NINE_DIGITS = /(?<!\d)\d{9}(?!\d)/g;
const ACCOUNT_DIGITS = /(?<!\d)\d{8,17}(?!\d)/;
const BANK_WORDS = /\b(?:routing|aba|bank\s+(?:account|acct)|checking|savings)\b/i;
const CREDENTIAL_WORDS =
  /\b(?:pins?|passcodes?|passwords?|one[\s-]?time\s+(?:pass)?codes?|verification\s+codes?|security\s+codes?|otp|cvv|cvc)\b/gi;
/** What follows a credential word: up to two filler words ("number is"), then a token with a digit. */
const CREDENTIAL_VALUE = /^[\s:#=.-]{0,4}(?:(?:number|no|is|was|code)[\s:#=.-]{1,3}){0,2}([A-Za-z0-9-]{1,16})/i;

function hasCredential(value: string): boolean {
  for (const m of value.matchAll(CREDENTIAL_WORDS)) {
    const start = (m.index ?? 0) + m[0].length;
    const token = CREDENTIAL_VALUE.exec(value.slice(start, start + 40))?.[1] ?? '';
    if (token.length >= 3 && /\d/.test(token)) return true;
  }
  return false;
}

/** What a free-text value looks like it holds. Values over 2,000 characters are checked up to that length. */
export function findSecrets(text: string): SecretFindings {
  const value = text.length > 2000 ? text.slice(0, 2000) : text;
  const ssn = [...value.matchAll(SSN_SPACED)].some((m) => isSsnShape(`${m[1]}${m[3]}${m[4]}`));
  const card = [...value.matchAll(CARD_RUN)].some((m) => isCardNumberLike(m[0].replace(/[ -]/g, '')));
  const routing =
    /\b(?:routing|aba)\b/i.test(value) && [...value.matchAll(NINE_DIGITS)].some((m) => isRoutingNumberLike(m[0]));
  const bankAccount = BANK_WORDS.test(value) && ACCOUNT_DIGITS.test(value);
  const credential = hasCredential(value);
  const compact = value.trim().replace(/ /g, '');
  const bareNine = /^\d{9}$/.test(compact) && (isSsnShape(compact) || isRoutingNumberLike(compact));
  return { ssn, card, routing, bankAccount, credential, bareNine };
}
