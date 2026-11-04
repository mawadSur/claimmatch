import type { EligibilityCriteria, Lawsuit, LawsuitTags, Profile, ProfileFact } from './types';
import { flags } from './flags';
import { lawsuitHasStructuredTags, normalizeLawsuitTags } from './lawsuit-tags';
import { dateRangesOverlap, factYearLabel } from './profile-facts';
import { isDeadlinePassed } from './utils';

export interface MatchResult {
  lawsuit_id: string;
  score: number; // 0..1
  reasons: string[];
  eligible: boolean;
}

/**
 * Health answers are never used. The medication question is gone (Phase 0)
 * and old answers may still sit in profiles until they are deleted, so a
 * criterion on one of these keys can never be met: a settlement that requires
 * one is never matched, and no reason ever mentions it.
 */
const HEALTH_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(['took_medication']);

/** Floor of a rule-verified eligible score (0.5 + hits/signals * 0.5). */
export const RULE_VERIFIED_FLOOR = 0.5;
/** State-only matches sit above heuristics and below attribute-verified rules. */
export const STATE_ONLY_SCORE_CAP = 0.55;
/** No structured rules and no category/keyword overlap. Below matchProfile's 0.4. */
export const UNSTRUCTURED_NONE_SCORE = 0.35;
export const UNSTRUCTURED_KEYWORD_SCORE = 0.4;
export const UNSTRUCTURED_CATEGORY_SCORE = 0.42;
export const UNSTRUCTURED_BOTH_SCORE = 0.45;

const CATEGORY_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  'Data Breach': ['had_data_breach'],
  Privacy: ['had_data_breach', 'uses_social_media'],
  'Auto & Vehicles': ['owns_vehicle', 'vehicle_brands'],
  'Financial & Banking': ['used_banking'],
  'Consumer Products': ['bought_consumer_goods'],
  'Food & Beverage': ['bought_consumer_goods'],
  Technology: ['uses_social_media', 'used_streaming'],
  Employment: ['employed_hourly'],
};

const KEYWORD_ATTRIBUTES: ReadonlyArray<{ pattern: RegExp; keys: readonly string[] }> = [
  { pattern: /\bdata[\s-]+breach\b|\bbreach(?:ed|es)?\b|\bexposed\b/i, keys: ['had_data_breach'] },
  {
    pattern: /\b(?:toyota|honda|ford|kia|hyundai|tesla|vehicle|vehicles|car|truck|suv)\b/i,
    keys: ['owns_vehicle', 'vehicle_brands'],
  },
  { pattern: /\b(?:overdraft|bank(?:ing)?|checking|debit)\b/i, keys: ['used_banking'] },
  {
    pattern: /\b(?:facebook|instagram|tiktok|social[\s-]+media)\b/i,
    keys: ['uses_social_media'],
  },
  { pattern: /\b(?:streaming|netflix|subscription|telecom)\b/i, keys: ['used_streaming'] },
  { pattern: /\b(?:hourly|gig[\s-]+job|overtime|wage)\b/i, keys: ['employed_hourly'] },
  {
    pattern: /\b(?:consumer[\s-]+product|household[\s-]+product|packaged[\s-]+food|supplement)\b/i,
    keys: ['bought_consumer_goods'],
  },
];

/**
 * Rule-based eligibility matcher. Evaluates a user's profile (state +
 * attributes collected during onboarding) against a lawsuit's structured
 * eligibility criteria and returns an internal 0..1 score + plain reasons.
 * The score orders results; it is never shown to people as a percentage.
 *
 * Settlements past their claim deadline never match. Settlements with no
 * structured rules stay at a low score unless MATCH_UNSTRUCTURED_ENABLED=1,
 * which adds category/keyword overlap against the profile (always below
 * rule-verified scores). MATCH_STATE_ONLY_CAP_ENABLED=1 caps a state-only
 * hit so it is not treated as a strong match.
 */
export function scoreLawsuit(
  profile: Profile,
  lawsuit: Lawsuit,
  now: Date = new Date(),
): MatchResult {
  if (isDeadlinePassed(lawsuit.deadline, now)) {
    return {
      lawsuit_id: lawsuit.id,
      score: 0,
      reasons: [],
      eligible: false,
    };
  }

  const criteria: EligibilityCriteria = lawsuit.eligibility || {};
  const attrs = profile.attributes || {};
  const tags = normalizeLawsuitTags(lawsuit.tags);
  const reasons: string[] = [];

  let signals = 0; // how many criteria we could check
  let hits = 0; // how many the user satisfied
  let hardFail = false;

  // --- State gate ---------------------------------------------------------
  if (criteria.states && criteria.states.length > 0) {
    signals += 1;
    if (profile.state && criteria.states.includes(profile.state)) {
      hits += 1;
      reasons.push(`Available in your state (${profile.state})`);
    } else {
      hardFail = true; // state-restricted and user isn't in-list
    }
  } else {
    reasons.push('Open nationwide');
  }

  // --- Required attributes (all must be truthy) ---------------------------
  if (criteria.requires && criteria.requires.length > 0) {
    for (const key of criteria.requires) {
      signals += 1;
      if (!HEALTH_ATTRIBUTE_KEYS.has(key) && isTruthy(attrs[key])) {
        hits += 1;
        reasons.push(labelFor(key));
      } else {
        hardFail = true;
      }
    }
  }

  // --- anyOf attributes (attribute value must be in the allowed set) ------
  if (criteria.anyOf) {
    for (const [key, allowed] of Object.entries(criteria.anyOf)) {
      if (HEALTH_ATTRIBUTE_KEYS.has(key)) continue;
      signals += 1;
      const value = attrs[key];
      const values = Array.isArray(value) ? value : [value];
      const overlap = values.some((v) => allowed.includes(v as string | boolean));
      if (overlap) {
        hits += 1;
        reasons.push(labelFor(key));
      }
      // anyOf is a soft signal, not a hard gate
    }
  }

  // Structured tags vs profile_facts (soft, like anyOf). Date overlap is
  // required when both the fact and the class period have dates.
  const facts = profile.facts ?? [];
  const factHits = scoreProfileFacts(facts, tags);
  for (const hit of factHits) {
    signals += 1;
    hits += 1;
    reasons.push(hit.reason);
  }
  signals += unmatchedStructuredTagSignals(tags, facts, factHits);

  // No structured matching criteria → broad low-confidence, or a category /
  // keyword overlap when MATCH_UNSTRUCTURED_ENABLED=1.
  if (signals === 0) {
    return unstructuredMatch(profile, lawsuit, reasons);
  }

  const eligible = !hardFail && hits > 0;
  let score = eligible ? Math.min(1, RULE_VERIFIED_FLOOR + (hits / signals) * 0.5) : 0;

  if (eligible && isStateOnlyCriteria(criteria, tags) && flags.stateOnlyCap()) {
    score = Math.min(score, STATE_ONLY_SCORE_CAP);
  }

  return {
    lawsuit_id: lawsuit.id,
    score: Number(score.toFixed(2)),
    reasons,
    eligible,
  };
}

/** Rank all lawsuits for a profile, returning only eligible ones, best first. */
export function matchProfile(
  profile: Profile,
  lawsuits: Lawsuit[],
  threshold = 0.4,
  now: Date = new Date(),
): MatchResult[] {
  return lawsuits
    .filter((l) => !isDeadlinePassed(l.deadline, now))
    .map((l) => scoreLawsuit(profile, l, now))
    .filter((r) => r.eligible && r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** Rule-verified hits vs heuristic / state-only. Never shown as a percentage. */
export type MatchStrength = 'strong' | 'possible';

export function matchStrengthLabel(strength: MatchStrength): string {
  return strength === 'strong' ? 'Strong match' : 'Possible match';
}

/**
 * Strong = structured requires/anyOf rules (attribute-verified).
 * Possible = state-only or unstructured category/keyword overlap.
 */
export function classifyMatch(lawsuit: Pick<Lawsuit, 'eligibility' | 'tags'>): MatchStrength {
  const criteria: EligibilityCriteria = lawsuit.eligibility || {};
  const tags = normalizeLawsuitTags(lawsuit.tags);
  if (isStateOnlyCriteria(criteria, tags)) return 'possible';
  const hasRequires = !!(criteria.requires && criteria.requires.length > 0);
  const hasAnyOf =
    !!criteria.anyOf &&
    Object.keys(criteria.anyOf).some((key) => !HEALTH_ATTRIBUTE_KEYS.has(key));
  return hasRequires || hasAnyOf || lawsuitHasStructuredTags(tags) ? 'strong' : 'possible';
}

function unstructuredMatch(
  profile: Profile,
  lawsuit: Lawsuit,
  reasons: string[],
): MatchResult {
  const fallbackReasons = reasons.length ? reasons : ['You may qualify — check the details'];

  if (!flags.unstructuredMatch()) {
    return {
      lawsuit_id: lawsuit.id,
      score: UNSTRUCTURED_NONE_SCORE,
      reasons: fallbackReasons,
      eligible: true,
    };
  }

  const attrs = profile.attributes || {};
  const categoryHit = categoryOverlapsProfile(lawsuit.category, attrs);
  const keywordHit = keywordOverlapsProfile(lawsuit, attrs);

  if (categoryHit) {
    reasons.push(`Related to ${lawsuit.category}`);
  }
  if (keywordHit) {
    reasons.push('May relate to your profile');
  }

  let score = UNSTRUCTURED_NONE_SCORE;
  if (categoryHit && keywordHit) score = UNSTRUCTURED_BOTH_SCORE;
  else if (categoryHit) score = UNSTRUCTURED_CATEGORY_SCORE;
  else if (keywordHit) score = UNSTRUCTURED_KEYWORD_SCORE;

  return {
    lawsuit_id: lawsuit.id,
    score,
    reasons: reasons.length ? reasons : fallbackReasons,
    eligible: true,
  };
}

function isStateOnlyCriteria(criteria: EligibilityCriteria, tags?: LawsuitTags | null): boolean {
  const hasStates = !!(criteria.states && criteria.states.length > 0);
  const hasRequires = !!(criteria.requires && criteria.requires.length > 0);
  const hasAnyOf =
    !!criteria.anyOf &&
    Object.keys(criteria.anyOf).some((key) => !HEALTH_ATTRIBUTE_KEYS.has(key));
  return hasStates && !hasRequires && !hasAnyOf && !lawsuitHasStructuredTags(tags);
}

interface FactHit {
  reason: string;
  kind: 'brand' | 'employer' | 'location';
}

function scoreProfileFacts(facts: ProfileFact[], tags: LawsuitTags): FactHit[] {
  if (!facts.length) return [];
  const hits: FactHit[] = [];
  const seenReasons = new Set<string>();

  const push = (hit: FactHit) => {
    if (seenReasons.has(hit.reason)) return;
    seenReasons.add(hit.reason);
    hits.push(hit);
  };

  for (const fact of facts) {
    if (HEALTH_ATTRIBUTE_KEYS.has(fact.type) || HEALTH_ATTRIBUTE_KEYS.has(fact.value)) continue;
    const value = fact.value.trim();
    if (!value) continue;

    if (fact.type === 'employer' && tags.employers?.length) {
      const match = firstTagMatch(value, tags.employers);
      if (match && factFitsClassPeriod(fact, tags)) {
        push({ kind: 'employer', reason: employerReason(match, fact, tags) });
      }
    }

    if (
      (fact.type === 'brand' || fact.type === 'product' || fact.type === 'purchase' || fact.type === 'account') &&
      tags.brands?.length
    ) {
      const match = firstTagMatch(value, tags.brands);
      if (match && factFitsClassPeriod(fact, tags)) {
        push({ kind: 'brand', reason: purchaseReason(match, fact, tags) });
      }
    }

    if (fact.type === 'location' && tags.states?.length) {
      const match = firstTagMatch(value, tags.states);
      if (match) {
        push({ kind: 'location', reason: `Lived in ${match}, a covered state` });
      }
    }
  }

  return hits;
}

function unmatchedStructuredTagSignals(
  tags: LawsuitTags,
  facts: ProfileFact[],
  hits: FactHit[],
): number {
  let n = 0;
  const hasBrandFacts = facts.some((f) =>
    f.type === 'brand' || f.type === 'product' || f.type === 'purchase' || f.type === 'account',
  );
  const hasEmployerFacts = facts.some((f) => f.type === 'employer');
  if (hasBrandFacts && tags.brands && tags.brands.length > 0 && !hits.some((h) => h.kind === 'brand')) {
    n += 1;
  }
  if (hasEmployerFacts && tags.employers && tags.employers.length > 0 && !hits.some((h) => h.kind === 'employer')) {
    n += 1;
  }
  return n;
}

function factFitsClassPeriod(fact: ProfileFact, tags: LawsuitTags): boolean {
  if (!tags.class_period_start && !tags.class_period_end) return true;
  if (!fact.start_date && !fact.end_date) return true;
  return dateRangesOverlap(
    fact.start_date,
    fact.end_date,
    tags.class_period_start,
    tags.class_period_end,
  );
}

function firstTagMatch(value: string, tags: string[]): string | null {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    tags.find((tag) => {
      const hay = tag.trim().toLowerCase();
      return hay === needle || hay.includes(needle) || needle.includes(hay);
    }) ?? null
  );
}

function purchaseReason(brand: string, fact: ProfileFact, tags: LawsuitTags): string {
  const year = factYearLabel(fact);
  const inside =
    Boolean(tags.class_period_start || tags.class_period_end) && factFitsClassPeriod(fact, tags);
  if (year && inside) return `Bought ${brand} in ${year}, inside the class period`;
  if (inside && (fact.start_date || fact.end_date)) {
    return `Bought ${brand} during the class period`;
  }
  if (year) return `Bought ${brand} in ${year}`;
  if (fact.type === 'account') return `Used ${brand}, a covered account or platform`;
  return `Bought ${brand}`;
}

function employerReason(employer: string, fact: ProfileFact, tags: LawsuitTags): string {
  const inside =
    Boolean(tags.class_period_start || tags.class_period_end) && factFitsClassPeriod(fact, tags);
  if (inside) return `Worked at ${employer} during the class period`;
  const year = factYearLabel(fact);
  if (year) return `Worked at ${employer} in ${year}`;
  return `Worked at ${employer}`;
}

function categoryOverlapsProfile(
  category: string | null | undefined,
  attrs: Record<string, unknown>,
): boolean {
  if (!category) return false;
  const keys = CATEGORY_ATTRIBUTES[category];
  if (!keys) return false;
  return keys.some((key) => profileHasAttribute(attrs, key));
}

function keywordOverlapsProfile(lawsuit: Lawsuit, attrs: Record<string, unknown>): boolean {
  const text = unstructuredText(lawsuit);
  if (!text) return false;

  if (KEYWORD_ATTRIBUTES.some((row) => row.pattern.test(text) && row.keys.some((key) => profileHasAttribute(attrs, key)))) {
    return true;
  }

  const brands = Array.isArray(attrs.vehicle_brands) ? attrs.vehicle_brands : [];
  return brands.some(
    (brand) => typeof brand === 'string' && brand.trim() && text.includes(brand.trim().toLowerCase()),
  );
}

function unstructuredText(lawsuit: Lawsuit): string {
  return [
    lawsuit.title,
    lawsuit.summary,
    lawsuit.description,
    lawsuit.eligibility_text,
    lawsuit.eligibility?.notes,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function profileHasAttribute(attrs: Record<string, unknown>, key: string): boolean {
  if (HEALTH_ATTRIBUTE_KEYS.has(key)) return false;
  return isTruthy(attrs[key]);
}

function isTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

const LABELS: Record<string, string> = {
  had_data_breach: 'Your data may have been exposed in a breach',
  owns_vehicle: 'You own or lease a vehicle',
  vehicle_brands: 'You own a covered vehicle brand',
  used_banking: 'You paid bank or overdraft fees',
  bought_consumer_goods: 'You bought a covered product',
  uses_social_media: 'You use a covered platform',
  used_streaming: 'You had a covered subscription',
  employed_hourly: 'You worked an hourly or gig job',
};

function labelFor(key: string): string {
  return LABELS[key] || `Matches: ${key.replace(/_/g, ' ')}`;
}
