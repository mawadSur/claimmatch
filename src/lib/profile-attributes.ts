import { ELIGIBILITY_QUESTIONS, RETIRED_QUESTION_KEYS } from './eligibility';
import type { EligibilityQuestion } from './types';

/**
 * Matcher questions collected after name and state. State stays a top-level
 * profile field (not an attributes key). Health keys stay out of this list.
 */
export const MATCHER_QUESTIONS: EligibilityQuestion[] = ELIGIBILITY_QUESTIONS.filter(
  (q) => q.key !== 'state',
);

/**
 * Health questions are optional, clearly labeled as sensitive, and never
 * required. matching.ts ignores these keys, so they do not change ranking.
 */
export const SENSITIVE_OPTIONAL_QUESTIONS: EligibilityQuestion[] = [
  {
    key: 'took_medication',
    label: 'Have you taken a medication or used a medical device named in a settlement notice?',
    type: 'boolean',
    help: 'Optional and sensitive. Skip unless you want this stored on your profile. We do not use it to rank matches.',
  },
];

const BOOLEAN_KEYS = new Set(
  [...MATCHER_QUESTIONS, ...SENSITIVE_OPTIONAL_QUESTIONS]
    .filter((q) => q.type === 'boolean')
    .map((q) => q.key),
);

const MULTISELECT_OPTIONS = new Map(
  [...MATCHER_QUESTIONS, ...SENSITIVE_OPTIONAL_QUESTIONS]
    .filter((q) => q.type === 'multiselect')
    .map((q) => [q.key, new Set(q.options ?? [])]),
);

const WRITABLE_KEYS = new Set([
  ...MATCHER_QUESTIONS.map((q) => q.key),
  ...SENSITIVE_OPTIONAL_QUESTIONS.map((q) => q.key),
]);

export type AttributeAnswers = Record<string, boolean | string[]>;

export type AttributesParseResult =
  | { ok: true; attributes: Record<string, unknown> }
  | { ok: false; error: string };

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 'yes' || value === 1) return true;
  if (value === false || value === 'false' || value === 'no' || value === 0) return false;
  return null;
}

/**
 * Validate a client payload of matcher (and optional health) answers.
 * Unknown keys are dropped. Retired health keys are only accepted from the
 * explicit optional question, never as a silent write.
 */
export function parseAttributeAnswers(input: unknown): AttributesParseResult {
  if (input === undefined) return { ok: true, attributes: {} };
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Check your answers and try again.' };
  }

  const attributes: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!WRITABLE_KEYS.has(key)) continue;
    if (RETIRED_QUESTION_KEYS.includes(key) && !SENSITIVE_OPTIONAL_QUESTIONS.some((q) => q.key === key)) {
      continue;
    }
    if (BOOLEAN_KEYS.has(key)) {
      if (raw === null || raw === undefined || raw === '') continue;
      const parsed = asBoolean(raw);
      if (parsed === null) return { ok: false, error: 'Check your answers and try again.' };
      attributes[key] = parsed;
      continue;
    }
    const allowed = MULTISELECT_OPTIONS.get(key);
    if (allowed) {
      const values = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw];
      if (!values.every((v) => typeof v === 'string')) {
        return { ok: false, error: 'Check your answers and try again.' };
      }
      attributes[key] = values.filter((v) => allowed.has(v));
    }
  }

  if (attributes.owns_vehicle === false) {
    attributes.vehicle_brands = [];
  }

  return { ok: true, attributes };
}

/**
 * Apply a validated attribute form: managed keys are replaced by the payload
 * (omitted optional health answers are cleared). Unknown stored keys stay.
 */
export function applyAttributePatch(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...(existing ?? {}) };
  for (const key of WRITABLE_KEYS) delete next[key];
  return { ...next, ...patch };
}

/** Merge a validated attribute patch into the stored JSON object. */
export function mergeAttributes(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return applyAttributePatch(existing, patch);
}

export function answersFromAttributes(attributes: Record<string, unknown> | null | undefined): AttributeAnswers {
  const attrs = attributes ?? {};
  const answers: AttributeAnswers = {};
  for (const q of MATCHER_QUESTIONS) {
    if (q.type === 'boolean') {
      const parsed = asBoolean(attrs[q.key]);
      if (parsed !== null) answers[q.key] = parsed;
    } else if (q.type === 'multiselect') {
      const value = attrs[q.key];
      answers[q.key] = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    }
  }
  for (const q of SENSITIVE_OPTIONAL_QUESTIONS) {
    const parsed = asBoolean(attrs[q.key]);
    if (parsed !== null) answers[q.key] = parsed;
  }
  return answers;
}

/** Whether the profile has anything the matcher can use besides an empty object. */
export function profileHasMatchSignals(profile: {
  state?: string | null;
  attributes?: Record<string, unknown> | null;
}): boolean {
  if (profile.state && profile.state.trim()) return true;
  const attrs = profile.attributes ?? {};
  return MATCHER_QUESTIONS.some((q) => {
    const value = attrs[q.key];
    if (Array.isArray(value)) return value.length > 0;
    return value === true || value === 'true' || value === 'yes' || value === 1;
  });
}
