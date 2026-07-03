import type { EligibilityCriteria, Lawsuit, Profile } from './types';

export interface MatchResult {
  lawsuit_id: string;
  score: number; // 0..1
  reasons: string[];
  eligible: boolean;
}

/**
 * Rule-based eligibility matcher. Evaluates a user's profile (state +
 * attributes collected during onboarding) against a lawsuit's structured
 * eligibility criteria and returns a confidence score + human reasons.
 *
 * This is intentionally transparent and deterministic. A future AI pass can
 * layer on top by populating `eligibility` from unstructured text.
 */
export function scoreLawsuit(profile: Profile, lawsuit: Lawsuit): MatchResult {
  const criteria: EligibilityCriteria = lawsuit.eligibility || {};
  const attrs = profile.attributes || {};
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
      if (isTruthy(attrs[key])) {
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

  // No structured criteria at all → treat as a broad, low-confidence match.
  if (signals === 0) {
    return {
      lawsuit_id: lawsuit.id,
      score: 0.35,
      reasons: reasons.length ? reasons : ['You may qualify — check the details'],
      eligible: true,
    };
  }

  const eligible = !hardFail && hits > 0;
  const score = eligible ? Math.min(1, 0.5 + (hits / signals) * 0.5) : 0;

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
): MatchResult[] {
  return lawsuits
    .map((l) => scoreLawsuit(profile, l))
    .filter((r) => r.eligible && r.score >= threshold)
    .sort((a, b) => b.score - a.score);
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
  took_medication: 'You used a covered medication or device',
};

function labelFor(key: string): string {
  return LABELS[key] || `Matches: ${key.replace(/_/g, ' ')}`;
}
