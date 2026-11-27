import { noPinBreachRank } from './claim-priority';
import { ELIGIBILITY_QUESTIONS, RETIRED_QUESTION_KEYS } from './eligibility';
import { matchProfile, matchStrengthFromScore, matchStrengthLabel, type MatchStrength } from './matching';
import { answersFromAttributes, parseAttributeAnswers, type AttributeAnswers } from './profile-attributes';
import type { EligibilityQuestion, Lawsuit, Profile } from './types';
import { isClaimActionType, type ClaimActionType } from './claim-actions';
import { US_STATES } from './utils';
6
/** Browser storage for logged-out preview answers until signup/onboarding. */
export const MATCH_PREVIEW_STORAGE_KEY = 'cm_match_preview';
9
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
20
export type MatchPreviewAttributeKey = (typeof MATCH_PREVIEW_ATTRIBUTE_KEYS)[number];
22
const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const PREVIEW_KEY_SET = new Set<string>(MATCH_PREVIEW_ATTRIBUTE_KEYS);
25
export const MATCH_PREVIEW_QUESTIONS: EligibilityQuestion[] = ELIGIBILITY_QUESTIONS.filter(
  (q) => q.key === 'state' || PREVIEW_KEY_SET.has(q.key),
);
29
export interface MatchPreviewDraft {
  state: string;
  attributes: Partial<Record<MatchPreviewAttributeKey, boolean>>;
}
34
export interface MatchPreviewResult {
  slug: string;
  title: string;
  typical_payout: string | null;
  deadline: string | null;
  strength: MatchStrength;
  strengthLabel: string;
  reasons: string[];
  claim_action_type: ClaimActionType | null;
}
44
const PREVIEW_RESULT_CAP = 8;
46
export function emptyMatchPreviewDraft(): MatchPreviewDraft {
  return { state: '', attributes: {} };
}
50
export function isPreviewAttributeKey(key: string): key is MatchPreviewAttributeKey {
  return PREVIEW_KEY_SET.has(key);
}
54
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
72
export function previewAnswersToAttributes(draft: MatchPreviewDraft): AttributeAnswers {
  const answers: AttributeAnswers = {};
  for (const [key, value] of Object.entries(draft.attributes)) {
    if (typeof value === 'boolean' && isPreviewAttributeKey(key)) {
      answers[key] = value;
    }
  }
  return answers;
}
82
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
96
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
111
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
122
/** Ordering options for the logged-out preview. */
export interface MatchPreviewOptions {
  /**
   * NO_PIN_BREACH_PRIORITY_ENABLED: within a strength band, show the
   * settlements whose official path needs no mailed notice ID first (breach
   * classes first of all) so the capped list is the easiest to finish.
   * Threaded in as an option rather than read here, to keep this function pure.
   */
  noPinBreachFirst?: boolean;
}

export function previewMatchesFor(
  lawsuits: Lawsuit[],
  draft: MatchPreviewDraft,
  now: Date = new Date(),
  opts: MatchPreviewOptions = {},
): MatchPreviewResult[] {
  const profile = previewProfileFromDraft(draft);
  const byId = new Map(lawsuits.map((row) => [row.id, row]));
  const rows = matchProfile(profile, lawsuits, 0.4, now)
    .map((result) => {
      const lawsuit = byId.get(result.lawsuit_id);
      if (!lawsuit) return null;
      const strength = matchStrengthFromScore(result.score);
      const payout = lawsuit.typical_payout?.trim() || null;
      return {
        row: {
          slug: lawsuit.slug,
          title: lawsuit.title,
          typical_payout: payout,
          deadline: lawsuit.deadline,
          strength,
          strengthLabel: matchStrengthLabel(strength),
          reasons: result.reasons.slice(0, 3),
          claim_action_type: isClaimActionType(lawsuit.claim_action_type) ? lawsuit.claim_action_type : null,
        } satisfies MatchPreviewResult,
        rank: noPinBreachRank({
          claim_action_type: lawsuit.claim_action_type,
          category: lawsuit.category,
          title: lawsuit.title,
          summary: lawsuit.summary,
        }),
      };
    })
    .filter((item): item is { row: MatchPreviewResult; rank: 0 | 1 | 2 } => item !== null);

  // Re-sort BEFORE the cap, so an easy-to-file row is not cut off by a
  // higher-scoring one that needs a mailed notice ID. Strength band first.
  if (opts.noPinBreachFirst) {
    rows.sort((a, b) => {
      if (a.row.strength !== b.row.strength) return a.row.strength === 'strong' ? -1 : 1;
      return a.rank - b.rank;
    });
  }

  return rows.map((item) => item.row).slice(0, PREVIEW_RESULT_CAP);
}
149
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
160
export function writeStoredMatchPreview(draft: MatchPreviewDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MATCH_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}
169
export function clearStoredMatchPreview(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MATCH_PREVIEW_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}
178
const SETTLEMENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
180
/** A catalog slug safe to put on /preview?settlement= and the preview API. */
export function parseSettlementScopeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.trim();
  if (!SETTLEMENT_SLUG.test(slug)) return null;
  return slug;
}
188
/** Preview URL scoped to one settlement. */
export function settlementPreviewPath(slug: string): string | null {
  const safe = parseSettlementScopeSlug(slug);
  return safe ? `/preview?settlement=${encodeURIComponent(safe)}` : null;
}

/** Guest save-by-link: restore answers from /preview query params. */
export function matchPreviewSharePath(draft: MatchPreviewDraft, settlementSlug?: string | null): string {
  const params = new URLSearchParams();
  const scoped = settlementSlug ? parseSettlementScopeSlug(settlementSlug) : null;
  if (scoped) params.set('settlement', scoped);
  if (draft.state) params.set('state', draft.state);
  for (const key of MATCH_PREVIEW_ATTRIBUTE_KEYS) {
    if (draft.attributes[key] === true) params.set(key, '1');
    else if (draft.attributes[key] === false) params.set(key, '0');
  }
  const qs = params.toString();
  return qs ? `/preview?${qs}` : '/preview';
}

export function draftFromPreviewSearch(
  params: Record<string, string | string[] | undefined>,
): MatchPreviewDraft | null {
  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const attributes: MatchPreviewDraft['attributes'] = {};
  for (const key of MATCH_PREVIEW_ATTRIBUTE_KEYS) {
    const raw = first(key);
    if (raw === '1' || raw === 'true') attributes[key] = true;
    else if (raw === '0' || raw === 'false') attributes[key] = false;
  }
  return parseMatchPreviewDraft({ state: first('state') ?? '', attributes });
}

/**
 * Server-readable mirror of the localStorage draft.
 *
 * The sign-up confirmation link can be opened in another browser, another
 * device or a private window, where localStorage is gone, so /onboarding also
 * reads the preview answers from this first-party cookie, set by
 * POST /api/match-preview. Modeled on PENDING_NEXT_COOKIE (src/lib/safe-next.ts):
 * same-site, one day, and cleared the moment onboarding is saved or skipped.
 * HttpOnly, because only the server reads it — the browser already has
 * localStorage. It holds the four yes/no answers plus the state code, never the
 * matched settlements.
 */
export const MATCH_PREVIEW_COOKIE = 'cm_preview';

const MATCH_PREVIEW_COOKIE_MAX_AGE = 86400;
/** Five short pairs; anything longer did not come from previewCookieValue. */
const MATCH_PREVIEW_COOKIE_MAX_LENGTH = 256;

/** The draft as query-string pairs — the encoding matchPreviewSharePath uses. */
export function previewCookieValue(draft: MatchPreviewDraft): string {
  const path = matchPreviewSharePath(draft);
  const q = path.indexOf('?');
  return q === -1 ? '' : path.slice(q + 1);
}

/** The draft a `cm_preview` cookie carries, or null when it is absent or junk. */
export function parsePreviewCookie(raw: string | null | undefined): MatchPreviewDraft | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.length > MATCH_PREVIEW_COOKIE_MAX_LENGTH) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const fields: Record<string, string> = {};
  new URLSearchParams(decoded).forEach((value, key) => {
    fields[key] = value;
  });
  // parseMatchPreviewDraft keeps only known keys, booleans and real state codes.
  return draftFromPreviewSearch(fields);
}

/** Set-Cookie for the preview mirror. */
export function previewCookie(draft: MatchPreviewDraft, secure: boolean): string {
  return `${MATCH_PREVIEW_COOKIE}=${encodeURIComponent(
    previewCookieValue(draft),
  )}; Path=/; Max-Age=${MATCH_PREVIEW_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}

194
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
221
export function previewMatchesForScope(
  lawsuits: Lawsuit[],
  draft: MatchPreviewDraft,
  slug: string | null,
  now: Date = new Date(),
  opts: MatchPreviewOptions = {},
): MatchPreviewResult[] {
  const safe = parseSettlementScopeSlug(slug);
  const pool = safe ? lawsuits.filter((row) => row.slug === safe) : lawsuits;
  return previewMatchesFor(pool, draft, now, opts);
}
232