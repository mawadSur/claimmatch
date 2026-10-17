import type { EligibilityCriteria, Lawsuit, ProofRequired } from './types';

/**
 * Proof-of-claim wording for catalog pages and cards.
 *
 * Feeds such as SettleSignal say "yes", "no", "optional" or "unknown". The
 * adapter keeps that value in eligibility.proof. Older rows only have the
 * proof_required boolean, where false means "not recorded", not "no proof
 * needed", so it reads as Unknown. Nothing here ever says "None".
 */

const PROOF_VALUES: readonly ProofRequired[] = ['yes', 'no', 'optional', 'unknown'];

/** Coerce any feed value to a known proof rule; anything else is 'unknown'. */
export function normalizeProof(value: unknown): ProofRequired {
  if (typeof value !== 'string') return 'unknown';
  const v = value.trim().toLowerCase();
  return (PROOF_VALUES as readonly string[]).includes(v) ? (v as ProofRequired) : 'unknown';
}

type ProofFields = Pick<Lawsuit, 'proof_required' | 'eligibility'>;

/**
 * Rows written before the adapter stored the feed's proof value only carry
 * "optional" as a note ("Proof of purchase is optional but may increase your
 * claim amount."), and refreshes never rewrite a published row's eligibility.
 */
const LEGACY_OPTIONAL_NOTE = /^\s*proof of purchase is optional\b/i;

/**
 * The proof rule for a record: the feed's value when stored, else Required
 * (old boolean), else Optional (old note), else Unknown. Used by the catalog
 * and the claim flow alike.
 */
export function proofStatus(lawsuit: ProofFields): ProofRequired {
  const stored = lawsuit.eligibility?.proof;
  if (stored !== undefined && stored !== null) {
    const proof = normalizeProof(stored);
    if (proof !== 'unknown') return proof;
  }
  if (lawsuit.proof_required) return 'yes';
  const notes = lawsuit.eligibility?.notes;
  if (typeof notes === 'string' && LEGACY_OPTIONAL_NOTE.test(notes)) return 'optional';
  return 'unknown';
}

const LABELS: Record<ProofRequired, string> = {
  yes: 'Required',
  no: 'Not required',
  optional: 'Optional',
  unknown: 'Unknown',
};

/** Short label for cards and stat boxes: Required, Not required, Optional or Unknown. */
export function proofLabel(lawsuit: ProofFields): string {
  return LABELS[proofStatus(lawsuit)];
}

const DETAILS: Record<ProofRequired, string> = {
  yes: 'The source says you need proof, such as receipts or records. Check the official notice for what counts.',
  no: 'The source says you don’t need proof. Check the official notice to be sure.',
  optional: 'The source says proof is optional and may raise your payment. Check the official notice for details.',
  unknown: 'We don’t know if you need proof. Check the official notice.',
};

/** One plain sentence for detail pages. */
export function proofDetail(lawsuit: ProofFields): string {
  return DETAILS[proofStatus(lawsuit)];
}

/** Eligibility criteria with the proof rule set (used by feed adapters). */
export function withProof(
  eligibility: EligibilityCriteria | undefined,
  proof: ProofRequired,
): EligibilityCriteria {
  return { ...(eligibility ?? {}), proof };
}
