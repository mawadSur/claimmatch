/**
 * Opt-in "new match" alert planner. Pure helpers live here so tests can cover
 * caps, verified/open filters, and reason sanitizing without Resend or a DB.
 *
 * Web push is out of scope. A later path can reuse match_alert_sends + this
 * planner without changing the audience or cap rules.
 */
import { MATCH_EMAIL_SCORE_THRESHOLD } from '@/lib/match-email';
import { matchProfile, type MatchResult } from '@/lib/matching';
import { isOpenForClaims } from '@/lib/open-for-claims';
import { isDeadlinePassed } from '@/lib/utils';
import { isVerifiedRecord } from '@/lib/verified-fields';
import type { Lawsuit, Profile } from '@/lib/types';
import { normalizeAlertEmail } from '@/lib/match-alert-token';

export const MATCH_ALERT_MAX_CLAIMS = 3;
export const MATCH_ALERT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type MatchAlertAudience = 'profile' | 'subscriber';

export type MatchAlertSkipReason =
  | 'flag_off'
  | 'weekly_cap'
  | 'no_matches'
  | 'unsubscribed'
  | 'empty_profile';

export interface MatchAlertClaim {
  lawsuitId: string;
  slug: string;
  title: string;
  deadline: string | null;
  reasons: string[];
  score: number;
}

export interface MatchAlertPerson {
  email: string;
  name?: string | null;
  source: MatchAlertAudience;
  userId?: string | null;
  state?: string | null;
  interests?: string[] | null;
  profile?: Pick<Profile, 'state' | 'attributes' | 'facts' | 'email_opt_in'> | null;
}

export interface PlannedMatchAlert {
  email: string;
  name?: string | null;
  source: MatchAlertAudience;
  userId?: string | null;
  claims: MatchAlertClaim[];
  skip?: MatchAlertSkipReason;
}

const HEALTHISH = /medication|health\b|diagnos|medical|prescription|condition|disease|injury/i;

/** True when this address already received a match-alert email in the last 7 days. */
export function withinWeeklyCap(lastSentAt: string | null | undefined, now: Date): boolean {
  if (!lastSentAt) return false;
  const t = Date.parse(lastSentAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < MATCH_ALERT_WEEK_MS;
}

export function pickAlertClaims<T>(rows: T[], max = MATCH_ALERT_MAX_CLAIMS): T[] {
  return rows.slice(0, max);
}

/**
 * Reasons that may appear in the email. Matcher health keys are already
 * excluded; this is defense in depth so a stored reason never leaks a
 * sensitive answer.
 */
export function publicMatchReasons(reasons: string[] | null | undefined): string[] {
  if (!reasons?.length) return [];
  const out: string[] = [];
  for (const raw of reasons) {
    const reason = raw.trim();
    if (!reason) continue;
    if (HEALTHISH.test(reason)) continue;
    out.push(reason);
    if (out.length >= 2) break;
  }
  return out;
}

export function isAlertableLawsuit(
  row: Pick<
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
  >,
  now: Date = new Date(),
): boolean {
  if (!isVerifiedRecord(row)) return false;
  if (!isOpenForClaims(row, now)) return false;
  if (isDeadlinePassed(row.deadline, now)) return false;
  return true;
}

export function matchAlertEmailsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MATCH_ALERT_EMAILS_ENABLED === '1';
}

/**
 * Hard blocks on actually calling Resend. Dry-run still plans. Tests and CI
 * never send, even if someone stubs RESEND_API_KEY.
 */
export function matchAlertSendBlocked(
  env: Record<string, string | undefined> = process.env,
): { blocked: true; reason: string } | { blocked: false } {
  if (env.MATCH_ALERT_EMAILS_ENABLED !== '1') {
    return { blocked: true, reason: 'flag_off' };
  }
  if (env.NODE_ENV === 'test' || env.VITEST) {
    return { blocked: true, reason: 'test_env' };
  }
  if (env.CI === 'true' && env.MATCH_ALERT_EMAILS_ALLOW_SEND !== '1') {
    return { blocked: true, reason: 'ci' };
  }
  return { blocked: false };
}

function interestHitsCategory(
  interests: string[] | null | undefined,
  lawsuit: Pick<Lawsuit, 'category' | 'title'>,
): boolean {
  if (!interests?.length) return false;
  const hay = `${lawsuit.category} ${lawsuit.title}`.toLowerCase();
  for (const raw of interests) {
    const needle = raw.trim().toLowerCase();
    if (needle.length < 3) continue;
    if (HEALTHISH.test(needle)) continue;
    if (hay.includes(needle) || needle.includes(lawsuit.category.toLowerCase())) return true;
  }
  return false;
}

/**
 * Lightweight match for newsletter subscribers (state + optional interests).
 * Never reads health answers — subscribers do not store them.
 */
export function scoreSubscriberMatch(
  subscriber: { state?: string | null; interests?: string[] | null },
  lawsuit: Lawsuit,
  now: Date = new Date(),
): MatchResult {
  if (isDeadlinePassed(lawsuit.deadline, now)) {
    return { lawsuit_id: lawsuit.id, score: 0, reasons: [], eligible: false };
  }
  const states = lawsuit.eligibility?.states ?? [];
  const reasons: string[] = [];
  if (states.length > 0) {
    if (!subscriber.state || !states.includes(subscriber.state)) {
      return { lawsuit_id: lawsuit.id, score: 0, reasons: [], eligible: false };
    }
    reasons.push(`Available in your state (${subscriber.state})`);
  } else if (subscriber.state) {
    reasons.push('Open nationwide');
  }

  const interest = interestHitsCategory(subscriber.interests, lawsuit);
  if (interest) reasons.push('Matches a topic you asked about');

  const eligible = reasons.length > 0 && (Boolean(subscriber.state) || interest);
  const score = eligible ? MATCH_EMAIL_SCORE_THRESHOLD : 0;
  return {
    lawsuit_id: lawsuit.id,
    score,
    reasons: publicMatchReasons(reasons),
    eligible,
  };
}

export function planPersonAlert(input: {
  person: MatchAlertPerson;
  lawsuits: Lawsuit[];
  alreadySentLawsuitIds: ReadonlySet<string>;
  lastSentAt?: string | null;
  now?: Date;
}): PlannedMatchAlert {
  const now = input.now ?? new Date();
  const email = normalizeAlertEmail(input.person.email);
  const base: PlannedMatchAlert = {
    email,
    name: input.person.name ?? null,
    source: input.person.source,
    userId: input.person.userId ?? null,
    claims: [],
  };

  if (input.person.profile && input.person.profile.email_opt_in === false) {
    return { ...base, skip: 'unsubscribed' };
  }
  if (withinWeeklyCap(input.lastSentAt, now)) {
    return { ...base, skip: 'weekly_cap' };
  }

  const open = input.lawsuits.filter(
    (row) => isAlertableLawsuit(row, now) && !input.alreadySentLawsuitIds.has(row.id),
  );
  if (open.length === 0) return { ...base, skip: 'no_matches' };

  let ranked: MatchResult[];
  if (input.person.source === 'profile' && input.person.profile) {
    const profile = input.person.profile;
    const hasSignal =
      Boolean(profile.state) ||
      Object.keys(profile.attributes || {}).length > 0 ||
      (profile.facts && profile.facts.length > 0);
    if (!hasSignal) return { ...base, skip: 'empty_profile' };
    ranked = matchProfile(
      {
        id: input.person.userId || 'profile',
        email,
        full_name: input.person.name ?? null,
        state: profile.state ?? null,
        zip: null,
        attributes: profile.attributes || {},
        email_opt_in: true,
        onboarded: true,
        is_admin: false,
        phone: null,
        sms_opt_in: false,
        referral_code: null,
        referred_by: null,
        facts: profile.facts,
        created_at: '',
        updated_at: '',
      },
      open,
      MATCH_EMAIL_SCORE_THRESHOLD,
      now,
    );
  } else {
    if (!input.person.state && !(input.person.interests && input.person.interests.length > 0)) {
      return { ...base, skip: 'empty_profile' };
    }
    ranked = open
      .map((lawsuit) =>
        scoreSubscriberMatch(
          { state: input.person.state, interests: input.person.interests },
          lawsuit,
          now,
        ),
      )
      .filter((row) => row.eligible && row.score >= MATCH_EMAIL_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);
  }

  const byId = new Map(open.map((row) => [row.id, row]));
  const claims: MatchAlertClaim[] = [];
  for (const row of ranked) {
    const lawsuit = byId.get(row.lawsuit_id);
    if (!lawsuit) continue;
    const reasons = publicMatchReasons(row.reasons);
    claims.push({
      lawsuitId: lawsuit.id,
      slug: lawsuit.slug,
      title: lawsuit.title,
      deadline: lawsuit.deadline,
      reasons,
      score: row.score,
    });
    if (claims.length >= MATCH_ALERT_MAX_CLAIMS) break;
  }

  if (claims.length === 0) return { ...base, skip: 'no_matches' };
  return { ...base, claims };
}

export function sampleMatchAlertClaims(): MatchAlertClaim[] {
  return [
    {
      lawsuitId: '00000000-0000-4000-8000-000000000001',
      slug: 'sample-data-breach',
      title: 'Sample data-breach settlement',
      deadline: '2027-06-30',
      reasons: ['Available in your state (CA)'],
      score: 0.75,
    },
    {
      lawsuitId: '00000000-0000-4000-8000-000000000002',
      slug: 'sample-consumer-product',
      title: 'Sample consumer product settlement',
      deadline: '2027-08-15',
      reasons: ['Open nationwide'],
      score: 0.5,
    },
  ];
}
