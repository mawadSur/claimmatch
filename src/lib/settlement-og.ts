import type { Lawsuit } from './types';
import { formatDeadline } from './utils';

/**
 * Copy for a per-settlement Open Graph card. Only stored fields: title and
 * the deadline when we have one. Never payout totals, user counts, or
 * testimonials.
 */

export const SETTLEMENT_OG_TAGLINE = 'Free to check, file on the official site';

export type SettlementOgCopy = {
  title: string;
  deadlineLine: string | null;
  tagline: string;
};

export function settlementOgCopy(
  lawsuit: Pick<Lawsuit, 'title' | 'deadline'>,
): SettlementOgCopy {
  const title = lawsuit.title.trim() || 'Settlement';
  const deadlineLine = lawsuit.deadline
    ? `Claim deadline ${formatDeadline(lawsuit.deadline)}`
    : null;
  return {
    title,
    deadlineLine,
    tagline: SETTLEMENT_OG_TAGLINE,
  };
}
