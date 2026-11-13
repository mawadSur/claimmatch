/**
 * Measured verification coverage for the admin card. Counts only — no PII.
 */
import { isFictionalSlug } from '@/lib/fictional-slugs';
import { flags } from '@/lib/flags';
import { isAlertableLawsuit } from '@/lib/match-alert';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { createServiceClient } from '@/lib/supabase/server';
import type { Lawsuit } from '@/lib/types';
import { isVerifiedRecord } from '@/lib/verified-fields';

export interface VerificationCoverage {
  openPublished: number;
  verified: number;
  verifiedPercent: number | null;
  pendingReview: number;
  alertEligible: number;
}

export type CoverageRow = Pick<
  Lawsuit,
  | 'slug'
  | 'status'
  | 'review_status'
  | 'deadline'
  | 'verified_at'
  | 'eligibility_verified'
  | 'proof_verified'
  | 'administrator'
  | 'eligibility_text'
  | 'eligibility'
  | 'proof_required'
>;

export function emptyVerificationCoverage(): VerificationCoverage {
  return {
    openPublished: 0,
    verified: 0,
    verifiedPercent: null,
    pendingReview: 0,
    alertEligible: 0,
  };
}

export function computeVerificationCoverage(
  rows: CoverageRow[],
  now: Date = new Date(),
): VerificationCoverage {
  let openPublished = 0;
  let verified = 0;
  let pendingReview = 0;
  let alertEligible = 0;
  for (const row of rows) {
    if (isFictionalSlug(row.slug)) continue;
    if (row.review_status === 'pending_review') pendingReview += 1;
    if (isOpenForClaims(row, now)) {
      openPublished += 1;
      if (isVerifiedRecord(row)) verified += 1;
    }
    if (isAlertableLawsuit(row, now)) alertEligible += 1;
  }
  return {
    openPublished,
    verified,
    verifiedPercent: openPublished > 0 ? Math.round((verified / openPublished) * 100) : null,
    pendingReview,
    alertEligible,
  };
}

export async function loadVerificationCoverage(now: Date = new Date()): Promise<VerificationCoverage | null> {
  if (!flags.verifyAssist()) return null;
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('lawsuits')
      .select(
        'slug, status, review_status, deadline, verified_at, eligibility_verified, proof_verified, administrator, eligibility_text, eligibility, proof_required',
      )
      .in('review_status', ['published', 'pending_review']);
    if (error || !data) return emptyVerificationCoverage();
    return computeVerificationCoverage(data as CoverageRow[], now);
  } catch {
    return emptyVerificationCoverage();
  }
}
