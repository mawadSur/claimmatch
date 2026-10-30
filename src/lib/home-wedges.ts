import { flags } from '@/lib/flags';
import { displayProofStatus } from '@/lib/verified-fields';
import { categorySlug } from '@/lib/settlement-seo';
import type { Lawsuit } from '@/lib/types';

export interface HomeWedgeAvailability {
  showBreachPrivacy: boolean;
  showDataBreach: boolean;
  showPrivacy: boolean;
  showNoProof: boolean;
}

function isCategory(lawsuit: Pick<Lawsuit, 'category'>, name: string): boolean {
  return categorySlug(lawsuit.category) === categorySlug(name);
}

/** Which home wedge cards have at least one open listing. No invented counts. */
export function homeWedgeAvailability(
  lawsuits: Array<
    Pick<Lawsuit, 'category' | 'proof_required' | 'eligibility'> &
      Partial<Pick<Lawsuit, 'proof_verified' | 'verified_at' | 'eligibility_verified' | 'administrator' | 'eligibility_text'>>
  >,
): HomeWedgeAvailability {
  const showDataBreach = lawsuits.some((l) => isCategory(l, 'Data Breach'));
  const showPrivacy = lawsuits.some((l) => isCategory(l, 'Privacy'));
  const showNoProof = lawsuits.some(
    (l) =>
      displayProofStatus({
        proof_required: l.proof_required ?? false,
        eligibility: l.eligibility ?? {},
        proof_verified: l.proof_verified,
        verified_at: l.verified_at,
        eligibility_verified: l.eligibility_verified,
        administrator: l.administrator ?? null,
        eligibility_text: l.eligibility_text ?? null,
      }) === 'no',
  );
  return {
    showDataBreach,
    showPrivacy,
    showBreachPrivacy: showDataBreach || showPrivacy,
    showNoProof,
  };
}

export function homeWedgesEnabled(): boolean {
  return flags.homeNarrowing() || flags.homeWedgeEntries();
}
