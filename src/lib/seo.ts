import type { Lawsuit } from './types';
import { formatDeadline } from './utils';
import { proofLabel } from './proof';

/** Strip a trailing "Settlement" so titles never read "X Settlement Settlement". */
export function settlementShortName(title: string): string {
  return title.replace(/\s+settlement$/i, '').trim() || title;
}

/**
 * Detail-page title.
 * With deadline: `{title}: Deadline {date}, Who Qualifies & Payout`
 * Without: `{title}: Who Qualifies & How to File`
 */
export function settlementMetaTitle(lawsuit: Pick<Lawsuit, 'title' | 'deadline'>): string {
  const name = lawsuit.title.trim();
  if (lawsuit.deadline) {
    return `${name}: Deadline ${formatDeadline(lawsuit.deadline)}, Who Qualifies & Payout`;
  }
  return `${name}: Who Qualifies & How to File`;
}

/** ~155 characters, truncated at a word boundary. */
export function truncateAtWord(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[.,;:–-]+$/, '')}…`;
}

export function settlementMetaDescription(
  lawsuit: Pick<Lawsuit, 'title' | 'deadline' | 'typical_payout' | 'proof_required' | 'eligibility' | 'summary'>,
): string {
  const deadline = lawsuit.deadline
    ? `File by ${formatDeadline(lawsuit.deadline)}.`
    : 'Check the official notice for the deadline.';
  const proof = `Proof: ${proofLabel(lawsuit)}.`;
  const payout = lawsuit.typical_payout
    ? `Payout: ${lawsuit.typical_payout}.`
    : '';
  const raw = [
    `${lawsuit.title} class-action settlement.`,
    deadline,
    proof,
    payout,
    'Free official claim link.',
  ]
    .filter(Boolean)
    .join(' ');
  return truncateAtWord(raw, 155);
}

export function isLawsuitClosed(
  lawsuit: Pick<Lawsuit, 'status' | 'deadline' | 'review_status'>,
): boolean {
  if (lawsuit.review_status === 'rejected') return true;
  if (lawsuit.status === 'closed') return true;
  if (!lawsuit.deadline) return false;
  const today = new Date().toISOString().slice(0, 10);
  return lawsuit.deadline < today;
}
