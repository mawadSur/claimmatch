import type { EligibilityCriteria, Lawsuit, ProofRequired } from './types';

export function normalizeProof(value: string | null | undefined): ProofRequired {
  if (value === 'yes' || value === 'no' || value === 'optional' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

/**
 * Human-readable proof label. Never shows "None" for unknown — only an explicit
 * `no` from the source feed is "None".
 */
export function proofLabel(
  lawsuit: Pick<Lawsuit, 'proof_required' | 'eligibility'>,
): string {
  const proof = lawsuit.eligibility?.proof;
  if (proof === 'yes') return 'Required';
  if (proof === 'no') return 'None';
  if (proof === 'optional') return 'Optional';
  if (proof === 'unknown') return 'Unknown — check official notice';
  if (lawsuit.proof_required) return 'Required';
  return 'Unknown — check official notice';
}

export function withProof(
  eligibility: EligibilityCriteria | undefined,
  proof: ProofRequired,
): EligibilityCriteria {
  return { ...(eligibility ?? {}), proof };
}
