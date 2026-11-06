/**
 * How many matcher questions the profile still lacks, and how many additional
 * open published settlements those answers could unlock. Never counts health
 * keys. Numbers come from the live catalog, not invented totals.
 */
import { RETIRED_QUESTION_KEYS } from '@/lib/eligibility';
import { matchProfile } from '@/lib/matching';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { MATCHER_QUESTIONS, profileHasMatchSignals } from '@/lib/profile-attributes';
import type { EligibilityCriteria, EligibilityQuestion, Lawsuit, Profile } from '@/lib/types';

const MATCHER_KEY_SET = new Set(MATCHER_QUESTIONS.map((q) => q.key));
const HEALTH_KEYS = new Set<string>(RETIRED_QUESTION_KEYS);
const QUESTION_BY_KEY = new Map(MATCHER_QUESTIONS.map((q) => [q.key, q]));

export interface ProfileCompleteness {
  unansweredCount: number;
  unansweredKeys: string[];
  additionalSettlements: number;
  hasMatchSignals: boolean;
  complete: boolean;
}

export const EMPTY_PROFILE_COMPLETENESS: ProfileCompleteness = {
  unansweredCount: 0,
  unansweredKeys: [],
  additionalSettlements: 0,
  hasMatchSignals: false,
  complete: true,
};

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 'yes' || value === 1) return true;
  if (value === false || value === 'false' || value === 'no' || value === 0) return false;
  return null;
}

export function isMatcherKeyAnswered(
  attributes: Record<string, unknown> | null | undefined,
  question: EligibilityQuestion,
): boolean {
  const attrs = attributes ?? {};
  if (HEALTH_KEYS.has(question.key)) return true;
  if (question.type === 'boolean') return asBoolean(attrs[question.key]) !== null;
  if (question.key === 'vehicle_brands') {
    if (asBoolean(attrs.owns_vehicle) === false) return true;
    return Array.isArray(attrs.vehicle_brands) && attrs.vehicle_brands.length > 0;
  }
  if (question.type === 'multiselect') {
    return Array.isArray(attrs[question.key]);
  }
  return attrs[question.key] != null && attrs[question.key] !== '';
}

export function unansweredMatcherKeys(
  attributes: Record<string, unknown> | null | undefined,
): string[] {
  return MATCHER_QUESTIONS.filter((q) => !HEALTH_KEYS.has(q.key) && !isMatcherKeyAnswered(attributes, q)).map(
    (q) => q.key,
  );
}

export function catalogMatcherKeys(criteria: EligibilityCriteria | null | undefined): string[] {
  const keys = new Set<string>();
  for (const key of criteria?.requires ?? []) {
    if (MATCHER_KEY_SET.has(key) && !HEALTH_KEYS.has(key)) keys.add(key);
  }
  for (const key of Object.keys(criteria?.anyOf ?? {})) {
    if (MATCHER_KEY_SET.has(key) && !HEALTH_KEYS.has(key)) keys.add(key);
  }
  return [...keys];
}

function brandsFromCatalog(settlements: readonly Pick<Lawsuit, 'eligibility'>[]): string[] {
  const brands = new Set<string>();
  for (const row of settlements) {
    const allowed = row.eligibility?.anyOf?.vehicle_brands ?? [];
    for (const value of allowed) {
      if (typeof value === 'string' && value.trim()) brands.add(value);
    }
  }
  return [...brands];
}

function filledAttributes(
  attributes: Record<string, unknown> | null | undefined,
  unansweredKeys: readonly string[],
  settlements: readonly Pick<Lawsuit, 'eligibility'>[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(attributes ?? {}) };
  const catalogBrands = brandsFromCatalog(settlements);
  for (const key of unansweredKeys) {
    const question = QUESTION_BY_KEY.get(key);
    if (!question || HEALTH_KEYS.has(key)) continue;
    if (question.type === 'boolean') {
      next[key] = true;
      continue;
    }
    if (key === 'vehicle_brands') {
      next.owns_vehicle = true;
      next.vehicle_brands = catalogBrands.length > 0 ? catalogBrands : ['Other'];
    }
  }
  return next;
}

function currentlyMatches(profile: Profile, lawsuit: Lawsuit, now: Date): boolean {
  return matchProfile(profile, [lawsuit], 0.4, now).length > 0;
}

/**
 * Count unanswered matcher questions that appear on open published settlements,
 * and how many of those settlements would newly match if the gaps were filled
 * with a qualifying answer. Hidden by the dashboard when complete, when the
 * flag is off, or when the profile has no matcher signals yet.
 */
export function profileCompleteness(
  profile: Pick<Profile, 'state' | 'attributes' | 'onboarded' | 'facts'>,
  settlements: readonly Lawsuit[],
  now: Date = new Date(),
): ProfileCompleteness {
  const hasMatchSignals = profileHasMatchSignals(profile);
  const open = settlements.filter((row) => isOpenForClaims(row, now));
  const catalogKeys = new Set(open.flatMap((row) => catalogMatcherKeys(row.eligibility)));
  const unansweredKeys = unansweredMatcherKeys(profile.attributes).filter((key) => catalogKeys.has(key));
  if (!hasMatchSignals || unansweredKeys.length === 0) {
    return {
      unansweredCount: unansweredKeys.length,
      unansweredKeys,
      additionalSettlements: 0,
      hasMatchSignals,
      complete: unansweredKeys.length === 0,
    };
  }

  const currentProfile = {
    state: profile.state ?? null,
    attributes: profile.attributes ?? {},
    onboarded: Boolean(profile.onboarded),
    facts: profile.facts,
  } as Profile;
  const filledProfile = {
    ...currentProfile,
    attributes: filledAttributes(profile.attributes, unansweredKeys, open),
  } as Profile;

  let additionalSettlements = 0;
  for (const lawsuit of open) {
    const keys = catalogMatcherKeys(lawsuit.eligibility);
    if (!keys.some((key) => unansweredKeys.includes(key))) continue;
    if (currentlyMatches(currentProfile, lawsuit, now)) continue;
    if (currentlyMatches(filledProfile, lawsuit, now)) additionalSettlements += 1;
  }

  return {
    unansweredCount: unansweredKeys.length,
    unansweredKeys,
    additionalSettlements,
    hasMatchSignals,
    complete: unansweredKeys.length === 0,
  };
}

export function shouldShowCompletenessCard(result: ProfileCompleteness): boolean {
  return result.hasMatchSignals && !result.complete && result.additionalSettlements > 0;
}
