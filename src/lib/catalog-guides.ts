import { eligibilitySummary } from './claim-input';
import { WE_HELP_YOU_FILE_SENTENCE, WE_FILE_THIS_CLAIM } from './copy';
import { officialLinkFor } from './lawsuit-display';
import { proofLabel, proofStatus } from './proof';
import { hasOfficialNoticeGuide, settlementProofDetail } from './settlement-guides';
import type { Lawsuit } from './types';
import { formatDeadline } from './utils';

export interface CatalogGuideFaq {
  q: string;
  a: string;
}

/**
 * Catalog-backed SEO guide copy for published open settlements that do not
 * have a curated official-notice overlay (src/lib/settlement-guides.ts).
 *
 * Every sentence is built from stored catalog fields. Missing payouts,
 * eligibility rules, deadlines and proof requirements stay missing — this
 * never invents a figure or class rule.
 */

export interface CatalogGuideSections {
  qualifies: string;
  deadline: string;
  payout: string;
  proof: string;
  howToFile: string;
}

export function hasCatalogGuideFacts(
  lawsuit: Pick<Lawsuit, 'eligibility_text' | 'deadline' | 'typical_payout' | 'administrator'>,
): boolean {
  return Boolean(
    eligibilitySummary(lawsuit.eligibility_text) ||
      lawsuit.deadline ||
      lawsuit.typical_payout?.trim() ||
      lawsuit.administrator?.trim(),
  );
}

function officialHow(lawsuit: Pick<Lawsuit, 'claim_url' | 'source_url' | 'source_id'>): string {
  const official = officialLinkFor(lawsuit);
  return official?.kind === 'official'
    ? ` File on the official site (${official.host}).`
    : ' File on the official settlement website.';
}

export function catalogHowToFile(
  lawsuit: Pick<Lawsuit, 'claim_url' | 'source_url' | 'source_id'>,
  agentLane = false,
): string {
  const how = officialHow(lawsuit);
  if (agentLane) {
    return `Check that you qualify on the official notice. ${WE_FILE_THIS_CLAIM} after you review and sign it. You can always file on the official site yourself instead, where filing is free.${how}`;
  }
  return `Check that you qualify on the official notice. ${WE_HELP_YOU_FILE_SENTENCE}${how}`;
}

/** Templated guide sections from catalog fields only. */
export function catalogGuideSections(
  lawsuit: Pick<
    Lawsuit,
    | 'title'
    | 'eligibility_text'
    | 'deadline'
    | 'typical_payout'
    | 'proof_required'
    | 'eligibility'
    | 'slug'
    | 'claim_url'
    | 'source_url'
    | 'source_id'
  >,
  agentLane = false,
): CatalogGuideSections {
  const name = lawsuit.title.trim();
  const qualifies = eligibilitySummary(lawsuit.eligibility_text);
  const payout = lawsuit.typical_payout?.trim() || null;
  return {
    qualifies: qualifies
      ? `Our listing says: ${qualifies} This is a short summary, not the official rules. Confirm who qualifies on the official notice before you file.`
      : `We don’t have the official rules for who qualifies for the ${name}. Read the official notice to see if you qualify.`,
    deadline: lawsuit.deadline
      ? `Our listing shows a claim deadline of ${formatDeadline(lawsuit.deadline)}. Deadlines often end at 11:59 pm in the settlement’s time zone. Check the official site for the exact cutoff.`
      : `This listing has no deadline. Check the official site for the cutoff.`,
    payout: payout
      ? `The listing states the payout as ${payout.replace(/[.]+$/, '')}. The amount you get depends on the settlement’s rules and how many people file. The official notice is the final word.`
      : `This listing does not state a payout amount. The official notice has the payment rules.`,
    proof: settlementProofDetail(lawsuit),
    howToFile: catalogHowToFile(lawsuit, agentLane),
  };
}

/**
 * Extra FAQs for catalog-backed guides. Official-notice extraFaqs still come
 * from settlement-guides.ts. This never repeats those, and never invents a
 * payout or eligibility rule.
 */
export function catalogGuideFaqs(
  lawsuit: Pick<
    Lawsuit,
    | 'title'
    | 'slug'
    | 'eligibility_text'
    | 'deadline'
    | 'typical_payout'
    | 'proof_required'
    | 'eligibility'
    | 'claim_url'
    | 'source_url'
    | 'source_id'
    | 'category'
  >,
): CatalogGuideFaq[] {
  if (hasOfficialNoticeGuide(lawsuit.slug)) return [];
  const name = lawsuit.title.trim();
  const faqs: CatalogGuideFaq[] = [];
  const qualifies = eligibilitySummary(lawsuit.eligibility_text);
  if (qualifies) {
    faqs.push({
      q: `Who may qualify for the ${name}?`,
      a: `Our listing says: ${qualifies} Confirm the class definition on the official notice before you file.`,
    });
  }
  if (lawsuit.deadline) {
    faqs.push({
      q: `When does the ${name} close?`,
      a: `The listed claim deadline is ${formatDeadline(lawsuit.deadline)}. Check the official site for the exact cutoff time.`,
    });
  }
  const payout = lawsuit.typical_payout?.trim();
  if (payout) {
    faqs.push({
      q: `What payout does the ${name} listing show?`,
      a: `The listing states the payout as ${payout.replace(/[.]+$/, '')}. The official notice is the final word on what a valid claim pays.`,
    });
  }
  if (proofStatus(lawsuit) !== 'unknown') {
    faqs.push({
      q: `Is proof required for the ${name}?`,
      a: `The listing marks proof as ${proofLabel(lawsuit).toLowerCase()}. ${settlementProofDetail(lawsuit)}`,
    });
  }
  if (lawsuit.category?.trim()) {
    faqs.push({
      q: `What kind of settlement is the ${name}?`,
      a: `Our catalog lists it under ${lawsuit.category.trim()}. Check the official notice for the claims it covers.`,
    });
  }
  return faqs;
}

/**
 * A short listing summary from stored fields only. Used when a catalog row
 * has no summary and no official-notice overlay. Never invents a payout.
 */
export function catalogGuideSummary(
  lawsuit: Pick<Lawsuit, 'title' | 'category' | 'summary' | 'typical_payout' | 'deadline'>,
): string | null {
  const existing = lawsuit.summary?.trim();
  if (existing) return existing;
  const parts = [`${lawsuit.title.trim()} is an open ${lawsuit.category.trim() || 'class-action'} settlement.`];
  if (lawsuit.deadline) parts.push(`The listed claim deadline is ${formatDeadline(lawsuit.deadline)}.`);
  const payout = lawsuit.typical_payout?.trim();
  if (payout) parts.push(`Listed payout: ${/[.!?…]['"”’)\]]*$/.test(payout) ? payout : `${payout}.`}`);
  parts.push('Check the official notice for who qualifies and how to file.');
  return parts.join(' ');
}
