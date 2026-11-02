import type { Lawsuit } from './types';
import { daysLeftToFile } from './utils';
import { displayProofStatus } from './verified-fields';

/**
 * Live facts for the home page, counted from the open catalog the page has
 * already loaded. Every number is a count of real listings: nothing is
 * estimated, rounded up, or padded.
 */
export interface HomeStats {
  /** Settlements open for claims right now. */
  open: number;
  /** Of those, how many have a real deadline within CLOSING_SOON_DAYS. */
  closingSoon: number;
  /** Of those, how many the listing says need no proof. */
  noProof: number;
  /** Latest time any open listing appeared in its source feed (ISO), or null. */
  updatedAt: string | null;
}

export const CLOSING_SOON_DAYS = 30;

export type HomeStatsRow = Pick<Lawsuit, 'deadline' | 'proof_required' | 'eligibility'> &
  Partial<
    Pick<
      Lawsuit,
      | 'last_seen_at'
      | 'proof_verified'
      | 'verified_at'
      | 'eligibility_verified'
      | 'administrator'
      | 'eligibility_text'
    >
  >;

export function homeStats(
  lawsuits: readonly HomeStatsRow[],
  now: Date = new Date(),
  withinDays: number = CLOSING_SOON_DAYS,
): HomeStats {
  let closingSoon = 0;
  let noProof = 0;
  let latest = Number.NEGATIVE_INFINITY;

  for (const l of lawsuits) {
    const days = daysLeftToFile(l.deadline, now);
    if (days !== null && days <= withinDays) closingSoon += 1;

    const proof = displayProofStatus({
      proof_required: l.proof_required ?? false,
      eligibility: l.eligibility ?? {},
      proof_verified: l.proof_verified,
      verified_at: l.verified_at,
      eligibility_verified: l.eligibility_verified,
      administrator: l.administrator ?? null,
      eligibility_text: l.eligibility_text ?? null,
    });
    if (proof === 'no') noProof += 1;

    const seen = l.last_seen_at ? Date.parse(l.last_seen_at) : Number.NaN;
    // Ignore future stamps (clock skew) so "updated" never claims a later date.
    if (Number.isFinite(seen) && seen <= now.getTime() && seen > latest) latest = seen;
  }

  return {
    open: lawsuits.length,
    closingSoon,
    noProof,
    updatedAt: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
  };
}

/** "359" / "1,204": a whole-number count for display. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(n)));
}

/** "Nov 1": the catalog's last refresh, in US Eastern (the deadline zone used across the site). */
export function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
