import { RULE_VERIFIED_FLOOR } from '@/lib/matching';
import type { Profile } from '@/lib/types';

/**
 * New-match emails only go out for stored rows at or above this score.
 * Same floor as a rule-verified match so weak keyword overlap is not emailed.
 */
export const MATCH_EMAIL_SCORE_THRESHOLD = RULE_VERIFIED_FLOOR;

export type MatchEmailFrequency = 'instant' | 'weekly';

export function parseEmailFrequency(value: unknown): MatchEmailFrequency | null {
  return value === 'instant' || value === 'weekly' ? value : null;
}

/**
 * How often this account should get new-match emails.
 * Older rows with a null frequency keep the previous instant behavior.
 * Opted-out accounts are off regardless of frequency.
 */
export function matchEmailCadence(
  profile: Pick<Profile, 'email_opt_in' | 'email_frequency'>,
): MatchEmailFrequency | 'off' {
  if (!profile.email_opt_in) return 'off';
  return parseEmailFrequency(profile.email_frequency) ?? 'instant';
}

export function wantsInstantMatchEmails(
  profile: Pick<Profile, 'email_opt_in' | 'email_frequency'>,
): boolean {
  return matchEmailCadence(profile) === 'instant';
}

export function wantsWeeklyMatchEmails(
  profile: Pick<Profile, 'email_opt_in' | 'email_frequency'>,
): boolean {
  return matchEmailCadence(profile) === 'weekly';
}

export function isEmailableStoredMatch(row: {
  score?: number | null;
  dismissed?: boolean | null;
  notified_at?: string | null;
}): boolean {
  if (row.dismissed) return false;
  if (row.notified_at) return false;
  const score = typeof row.score === 'number' ? row.score : 0;
  return score >= MATCH_EMAIL_SCORE_THRESHOLD;
}
