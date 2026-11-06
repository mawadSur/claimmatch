import { ELIGIBILITY_QUESTIONS, RETIRED_QUESTION_KEYS } from './eligibility';
import { classifyMatch, matchProfile, matchStrengthLabel, type MatchStrength } from './matching';
import { answersFromAttributes, parseAttributeAnswers, type AttributeAnswers } from './profile-attributes';
import type { EligibilityQuestion, Lawsuit, Profile } from './types';
import { US_STATES } from './utils';

/** Browser storage for logged-out preview answers until signup/onboarding. */
export const MATCH_PREVIEW_STORAGE_KEY = 'cm_match_preview';

/**
 * Short preview: state plus the yes/no matcher items that cover products,
 * services, and data-breach notices. No health keys. No vehicle-brand list.
 */
export const MATCH_PREVIEW_ATTRIBUTE_KEYS = [
  'had_data_breach',
  'bought_consumer_goods',
  'used_banking',
  'used_streaming',
] as const;

export type MatchPreviewAttributeKey = (typeof MATCH_PREVIEW_ATTRIBUTE_KEYS)[number];

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const PREVIEW_KEY_SET = new Set<string>(MATCH_PREVIEW_ATTRIBUTE_KEYS);

export const MATCH_PREVIEW_QUESTIONS: EligibilityQuestion[] = ELIGIBILITY_QUESTIONS.filter(
  (q) => q.key === 'state' || PREVIEW_KEY_SET.has(q.key),
);

export interface MatchPreviewDraft {
  state: string;
  attributes: Partial<Record<MatchPreviewAttributeKey, boolean>>;
}

export interface MatchPreviewResult {
  slug: string;
  title: string;
  typical_payout: string | null;
  deadline: string | null;
  strength: MatchStrength;
  strengthLabel: string;
  reasons: string[];
}

const PREVIEW_RESULT_CAP = 8;

export function emptyMatchPreviewDraft(): MatchPreviewDraft {
  return { state: '', attributes: {} };
}

export function isPreviewAttributeKey(key: string): key is MatchPreviewAttributeKey {
  return PREVIEW_KEY_SET.has(key);
}

export function parseMatchPreviewDraft(raw: unknown): MatchPreviewDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const state = typeof input.state === 'string' && STATE_CODES.has(input.state) ? input.state : '';
  const source =
    input.attributes && typeof input.attributes === 'object' && !Array.isArray(input.attributes)
      ? (input.attributes as Record<string, unknown>)
      : input;
  const attributes: MatchPreviewDraft['attributes'] = {};
  for (const key of MATCH_PREVIEW_ATTRIBUTE_KEYS) {
    if (RETIRED_QUESTION_KEYS.includes(key)) continue;
    if (source[key] === true) attributes[key] = true;
    else if (source[key] === false) attributes[key] = false;
  }
  if (!state && Object.keys(attributes).length === 0) return null;
  return { state, attributes };
}

export function previewAnswersToAttributes(draft: MatchPreviewDraft): AttributeAnswers {
  const answers: AttributeAnswers = {};
  for (const [key, value] of Object.entries(draft.attributes)) {
    if (typeof value === 'boolean' && isPreviewAttributeKey(key)) {
      answers[key] = value;
    }
  }
  return answers;
}

/** Fill blank onboarding answers from a stored preview. Existing values win. */
export function mergePreviewIntoAnswers(
  existing: AttributeAnswers,
  draft: MatchPreviewDraft | null,
): AttributeAnswers {
  if (!draft) return existing;
  const next = { ...existing };
  for (const [key, value] of Object.entries(draft.attributes)) {
    if (typeof value !== 'boolean' || !isPreviewAttributeKey(key)) continue;
    if (next[key] === undefined) next[key] = value;
  }
  return next;
}

export function draftFromAttributes(
  state: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): MatchPreviewDraft {
  const answers = answersFromAttributes(attributes);
  const draft = emptyMatchPreviewDraft();
  if (state && STATE_CODES.has(state)) draft.state = state;
  for (const key of MATCH_PREVIEW_ATTRIBUTE_KEYS) {
    if (answers[key] === true || answers[key] === false) {
      draft.attributes[key] = answers[key] as boolean;
    }
  }
  return draft;
}

export function previewProfileFromDraft(draft: MatchPreviewDraft): Profile {
  const parsed = parseAttributeAnswers(previewAnswersToAttributes(draft));
  const attributes = parsed.ok ? parsed.attributes : {};
  return {
    id: 'preview',
    state: draft.state && STATE_CODES.has(draft.state) ? draft.state : null,
    attributes,
    onboarded: false,
  } as Profile;
}

export function previewMatchesFor(
  lawsuits: Lawsuit[],
  draft: MatchPreviewDraft,
  now: Date = new Date(),
): MatchPreviewResult[] {
  const profile = previewProfileFromDraft(draft);
  const byId = new Map(lawsuits.map((row) => [row.id, row]));
  return matchProfile(profile, lawsuits, 0.4, now)
    .map((result) => {
      const lawsuit = byId.get(result.lawsuit_id);
      if (!lawsuit) return null;
      const strength = classifyMatch(lawsuit);
      const payout = lawsuit.typical_payout?.trim() || null;
      return {
        slug: lawsuit.slug,
        title: lawsuit.title,
        typical_payout: payout,
        deadline: lawsuit.deadline,
        strength,
        strengthLabel: matchStrengthLabel(strength),
        reasons: result.reasons.slice(0, 3),
      } satisfies MatchPreviewResult;
    })
    .filter((row): row is MatchPreviewResult => row !== null)
    .slice(0, PREVIEW_RESULT_CAP);
}

export function readStoredMatchPreview(): MatchPreviewDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MATCH_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    return parseMatchPreviewDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredMatchPreview(draft: MatchPreviewDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MATCH_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

export function clearStoredMatchPreview(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MATCH_PREVIEW_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

const SETTLEMENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** A catalog slug safe to put on /preview?settlement= and the preview API. */
export function parseSettlementScopeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.trim();
  if (!SETTLEMENT_SLUG.test(slug)) return null;
  return slug;
}

/** Preview URL scoped to one settlement. */
export function settlementPreviewPath(slug: string): string | null {
  const safe = parseSettlementScopeSlug(slug);
  return safe ? `/preview?settlement=${encodeURIComponent(safe)}` : null;
}

/**
 * Questions for a settlement-scoped preview. Only onboarding keys the listing
 * actually uses (state / requires / anyOf) and that the short preview already
 * asks. Never invents a question from eligibility_text. If the row has no
 * structured preview keys, the standard short set is used.
 */
export function scopedPreviewQuestions(
  eligibility: Lawsuit['eligibility'] | null | undefined,
): EligibilityQuestion[] {
  const criteria = eligibility || {};
  const wanted = new Set<string>();
  if (criteria.states && criteria.states.length > 0) wanted.add('state');
  for (const key of criteria.requires ?? []) {
    if (key === 'state' || PREVIEW_KEY_SET.has(key)) wanted.add(key);
  }
  for (const key of Object.keys(criteria.anyOf ?? {})) {
    if (PREVIEW_KEY_SET.has(key)) wanted.add(key);
  }
  const scoped = MATCH_PREVIEW_QUESTIONS.filter((q) => wanted.has(q.key));
  if (scoped.length === 0) return MATCH_PREVIEW_QUESTIONS;
  if (!scoped.some((q) => q.key === 'state')) {
    const state = MATCH_PREVIEW_QUESTIONS.find((q) => q.key === 'state');
    if (state) return [state, ...scoped];
  }
  return scoped;
}

export function previewMatchesForScope(
  lawsuits: Lawsuit[],
  draft: MatchPreviewDraft,
  slug: string | null,
  now: Date = new Date(),
): MatchPreviewResult[] {
  const safe = parseSettlementScopeSlug(slug);
  const pool = safe ? lawsuits.filter((row) => row.slug === safe) : lawsuits;
  return previewMatchesFor(pool, draft, now);
}
