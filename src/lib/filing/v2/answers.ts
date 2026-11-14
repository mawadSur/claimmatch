/**
 * Answers to a spec's questions: shape, options and validation, plus the
 * normalization the canonical packet relies on (NFC, trimmed strings,
 * multi_choice values unique and sorted). Pure. Used at the API boundary
 * (strict) and by the packet builder (shape only, so a stored answer that no
 * longer fits its question after a spec change is dropped, never guessed).
 */
import { z } from 'zod';
import { US_STATES } from '@/lib/utils';
import type { AnswerValue, MemberDraft } from './contract';
import type { SpecQuestion } from './contract-spec';

export type AnswerCheck = { ok: true; value: AnswerValue } | { ok: false; message: string };

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const EMAIL = z.string().email().max(320);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const ZIP = /^\d{5}(?:-\d{4})?$/;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const NOTICE_ID = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,99}$/;
const PHONE_CHARS = /^[0-9+().\-\s]+$/;
const MAX_TEXT = 2000;

const STRING_TYPES = new Set([
  'text',
  'long_text',
  'email',
  'phone',
  'date',
  'money',
  'us_state',
  'zip',
  'vin',
  'notice_id',
]);

/** NFC, trimmed; null when blank. */
export function cleanText(value: string): string | null {
  const text = value.normalize('NFC').trim();
  return text === '' ? null : text;
}

function isCalendarDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function checkString(question: SpecQuestion, raw: string): AnswerCheck {
  let value = cleanText(raw);
  if (value === null) return { ok: true, value: null };
  if (value.length > MAX_TEXT) return { ok: false, message: `Use at most ${MAX_TEXT} characters.` };
  switch (question.type) {
    case 'email':
      if (!EMAIL.safeParse(value).success) return { ok: false, message: 'Enter a valid email address.' };
      break;
    case 'phone': {
      const digits = value.replace(/\D/g, '').length;
      if (!PHONE_CHARS.test(value) || digits < 7 || digits > 15) return { ok: false, message: 'Enter a phone number.' };
      break;
    }
    case 'date':
      if (!isCalendarDate(value)) return { ok: false, message: 'Enter a date as YYYY-MM-DD.' };
      break;
    case 'money':
      if (!MONEY.test(value)) return { ok: false, message: 'Enter an amount like 12.34.' };
      break;
    case 'us_state':
      value = value.toUpperCase();
      if (!STATE_CODES.has(value)) return { ok: false, message: 'Enter a two-letter state code.' };
      break;
    case 'zip':
      if (!ZIP.test(value)) return { ok: false, message: 'Enter a 5-digit ZIP code.' };
      break;
    case 'vin':
      value = value.toUpperCase();
      if (!VIN.test(value)) return { ok: false, message: 'Enter the 17-character VIN.' };
      break;
    case 'notice_id':
      if (!NOTICE_ID.test(value)) return { ok: false, message: 'Enter the ID exactly as it appears on your notice.' };
      break;
    default:
      break;
  }
  return { ok: true, value };
}

function optionValues(question: SpecQuestion): Set<string> {
  return new Set((question.options ?? []).map((o) => o.value));
}

/** Type and options only. null means "no answer". */
export function checkAnswerShape(question: SpecQuestion, raw: unknown): AnswerCheck {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (STRING_TYPES.has(question.type)) {
    if (typeof raw !== 'string') return { ok: false, message: 'Enter text.' };
    return checkString(question, raw);
  }
  switch (question.type) {
    case 'integer':
      return typeof raw === 'number' && Number.isSafeInteger(raw)
        ? { ok: true, value: raw }
        : { ok: false, message: 'Enter a whole number.' };
    case 'decimal':
      return typeof raw === 'number' && Number.isFinite(raw)
        ? { ok: true, value: raw }
        : { ok: false, message: 'Enter a number.' };
    case 'yes_no':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, message: 'Answer yes or no.' };
    case 'single_choice': {
      if (typeof raw !== 'string') return { ok: false, message: 'Choose one of the options.' };
      const value = cleanText(raw);
      if (value === null) return { ok: true, value: null };
      return optionValues(question).has(value) ? { ok: true, value } : { ok: false, message: 'Choose one of the options.' };
    }
    case 'multi_choice': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
        return { ok: false, message: 'Choose from the options.' };
      }
      const allowed = optionValues(question);
      const values = [...new Set((raw as string[]).map(cleanText).filter((v): v is string => v !== null))].sort();
      if (values.some((v) => !allowed.has(v))) return { ok: false, message: 'Choose from the options.' };
      return { ok: true, value: values.length ? values : null };
    }
    default:
      return { ok: false, message: 'This question can’t be answered here.' };
  }
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/** The boundary check: shape, options and the spec's validation (min, max, lengths, pattern). */
export function validateAnswer(question: SpecQuestion, raw: unknown): AnswerCheck {
  const shape = checkAnswerShape(question, raw);
  if (!shape.ok || shape.value === null) return shape;
  const rules = question.validation;
  if (!rules) return shape;
  const value = shape.value;
  const numeric =
    typeof value === 'number' ? value : question.type === 'money' && typeof value === 'string' ? Number(value) : null;
  if (numeric !== null) {
    if (rules.min !== undefined && numeric < rules.min) return { ok: false, message: `Must be at least ${rules.min}.` };
    if (rules.max !== undefined && numeric > rules.max) return { ok: false, message: `Must be at most ${rules.max}.` };
  }
  const length = typeof value === 'string' || Array.isArray(value) ? value.length : null;
  if (length !== null) {
    if (rules.min_length !== undefined && length < rules.min_length) {
      return { ok: false, message: `Use at least ${rules.min_length} characters.` };
    }
    if (rules.max_length !== undefined && length > rules.max_length) {
      return { ok: false, message: `Use at most ${rules.max_length} characters.` };
    }
  }
  if (rules.pattern && typeof value === 'string') {
    const re = compilePattern(rules.pattern);
    if (re && !re.test(value)) return { ok: false, message: rules.pattern_hint || 'Check the format of this answer.' };
  }
  return shape;
}

/** The member block as stored in claim_packets.member_snapshot: only the fields the member set. */
export type MemberSnapshot = Partial<Omit<MemberDraft, 'address'>> & { address?: Partial<MemberDraft['address']> };

const SNAPSHOT_FIELDS = ['legal_name', 'first_name', 'last_name', 'email', 'phone'] as const;
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'zip'] as const;

function cleanNullable(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? cleanText(value) : undefined;
}

/** A stored snapshot read back leniently: known fields only, strings cleaned. */
export function readMemberSnapshot(raw: unknown): MemberSnapshot {
  const out: MemberSnapshot = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  for (const key of SNAPSHOT_FIELDS) {
    const v = cleanNullable(source[key]);
    if (v !== undefined) out[key] = v;
  }
  const address = source.address;
  if (address && typeof address === 'object' && !Array.isArray(address)) {
    const a = address as Record<string, unknown>;
    const next: Partial<MemberDraft['address']> = {};
    for (const key of ADDRESS_FIELDS) {
      const v = cleanNullable(a[key]);
      if (v !== undefined) next[key] = v;
    }
    if (Object.keys(next).length) out.address = next;
  }
  return out;
}

/** Applies the member's edits (already schema-checked) to the snapshot. null clears a field. */
export function mergeMemberSnapshot(snapshot: MemberSnapshot, patch: MemberSnapshot): MemberSnapshot {
  const out: MemberSnapshot = { ...snapshot, address: { ...(snapshot.address ?? {}) } };
  for (const key of SNAPSHOT_FIELDS) {
    const v = cleanNullable(patch[key]);
    if (v !== undefined) out[key] = v;
  }
  for (const key of ADDRESS_FIELDS) {
    const v = cleanNullable(patch.address?.[key]);
    if (v !== undefined) out.address![key] = key === 'state' && v ? v.toUpperCase() : v;
  }
  if (Object.keys(out.address ?? {}).length === 0) delete out.address;
  return out;
}

/** The member paths an edit touches (for refuse-to-store checks). */
export function memberPatchPaths(patch: MemberSnapshot): string[] {
  const paths: string[] = SNAPSHOT_FIELDS.filter((k) => patch[k] !== undefined).map((k) => `member.${k}`);
  for (const key of ADDRESS_FIELDS) if (patch.address?.[key] !== undefined) paths.push(`member.address.${key}`);
  return paths;
}
