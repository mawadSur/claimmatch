import { daysUntil } from '@/lib/utils';
import type { EligibilityCriteria, Lawsuit, Profile } from '@/lib/types';

/**
 * Health answers are optional, sensitive, and never used as match features.
 * matching.ts already ignores these keys; keep this list in lockstep.
 */
export const HEALTH_FEATURE_KEYS: ReadonlySet<string> = new Set(['took_medication']);

export const MATCH_MODEL_VERSION = process.env.MATCH_MODEL_VERSION || 'rule-v1';

export interface MatchFeatureInput {
  attribute_overlap: string[];
  state: string | null;
  category: string | null;
  deadline_days: number | null;
  proof_required: string | null;
  payout_size: number | null;
  model_version: string;
}

function isTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

function sanitizeSignals(keys: string[]): string[] {
  return [...new Set(keys.filter((k) => k && !HEALTH_FEATURE_KEYS.has(k)))];
}

/** Attribute keys the profile and the structured rules share. Health keys dropped. */
export function attributeOverlap(
  profile: Pick<Profile, 'attributes'>,
  criteria: EligibilityCriteria | null | undefined,
): string[] {
  const attrs = profile.attributes || {};
  const keys: string[] = [];
  for (const key of criteria?.requires ?? []) {
    if (HEALTH_FEATURE_KEYS.has(key)) continue;
    if (isTruthy(attrs[key])) keys.push(key);
  }
  for (const key of Object.keys(criteria?.anyOf ?? {})) {
    if (HEALTH_FEATURE_KEYS.has(key)) continue;
    if (isTruthy(attrs[key])) keys.push(key);
  }
  return sanitizeSignals(keys);
}

export function payoutSize(lawsuit: Pick<Lawsuit, 'payout_min' | 'payout_max'>): number | null {
  if (typeof lawsuit.payout_max === 'number') return lawsuit.payout_max;
  if (typeof lawsuit.payout_min === 'number') return lawsuit.payout_min;
  return null;
}

export function proofFeature(
  lawsuit: Pick<Lawsuit, 'proof_required' | 'proof_verified' | 'eligibility'>,
): string | null {
  if (lawsuit.proof_verified) return lawsuit.proof_verified;
  if (lawsuit.eligibility?.proof) return lawsuit.eligibility.proof;
  if (lawsuit.proof_required === true) return 'yes';
  if (lawsuit.proof_required === false) return 'no';
  return null;
}

/** Snapshot used for later training. Never includes health answers. */
export function buildMatchFeatures(
  profile: Pick<Profile, 'state' | 'attributes'>,
  lawsuit: Pick<
    Lawsuit,
    'eligibility' | 'category' | 'deadline' | 'proof_required' | 'proof_verified' | 'payout_min' | 'payout_max'
  >,
  now: Date = new Date(),
  modelVersion = MATCH_MODEL_VERSION,
): MatchFeatureInput {
  return {
    attribute_overlap: attributeOverlap(profile, lawsuit.eligibility),
    state: profile.state ?? null,
    category: lawsuit.category ?? null,
    deadline_days: daysUntil(lawsuit.deadline, now),
    proof_required: proofFeature(lawsuit),
    payout_size: payoutSize(lawsuit),
    model_version: modelVersion,
  };
}

export function sanitizeMatchedSignals(signals: unknown): string[] {
  if (!Array.isArray(signals)) return [];
  return sanitizeSignals(signals.filter((s): s is string => typeof s === 'string'));
}
