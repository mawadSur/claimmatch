/**
 * The dashboard's view model: ranked matches, the user's claims grouped by
 * next step, the corrective notices, and a "Closing soon" catalog module.
 * Pure, so the decisions are tested in tests/claims-dashboard.test.ts.
 * Relative imports only: the native app imports this file, and '@/' points
 * at the app's own src there.
 */
import {
  claimActionAvailability,
  deadlineCountdown,
  displayClaimStatus,
  isOpenForClaims,
  legacyFilingState,
  legacyNextStep,
  reportByDay,
  settlementContext,
  type ClaimGroup,
  type LegacyFilingState,
  type ClaimTone,
  type ClaimView,
  type IsFictional,
  type SettlementFacts,
} from '../../lib/claims';
import { noPinBreachRank } from '../../lib/claim-priority';
import { pickClosingSoon } from '../../lib/closing-soon';
import { officialSiteUrl } from '../../lib/lawsuit-display';
import {
  matchProfile,
  matchStrengthFromScore,
  matchStrengthLabel,
  type MatchStrength,
} from '../../lib/matching';
import { profileHasMatchSignals } from '../../lib/profile-attributes';
import { buildClaimTimeline, type ClaimTimelineView } from '../../lib/claim-timeline';
import { finitePayoutAmount } from '../../lib/owed-estimate';
import type { Lawsuit, Match, Profile } from '../../lib/types';
import { formatDeadline } from '../../lib/utils';
import {
  PAPER_FALLBACK_CTA,
  PAPER_FALLBACK_HEADING,
  paperFormHref,
  pinAdminStatus,
} from '../../lib/pin-admin-email';

const NEW_MATCH_MS = 7 * 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DashboardSettlement extends SettlementFacts {
  id: string;
  title: string;
  claim_url: string | null;
  final_approval_hearing_at?: string | null;
  payment_timing_text?: string | null;
  claim_action_type?: string | null;
  claim_action?: { form_url?: string | null } | null;
}

export interface DashboardRow {
  claimId: string;
  title: string;
  label: string;
  tone: ClaimTone;
  group: ClaimGroup;
  deadlineText: string;
  nextStep: string;
  action: { label: string; href: string } | null;
  /** Present when the user marked the claim submitted. UI gates on CLAIM_TIMELINE_ENABLED. */
  timeline?: ClaimTimelineView | null;
}

export interface NoticeItem {
  claimId: string;
  title: string;
  kind: 'legacy' | 'fictional';
  deadline: string | null;
  deadlinePassed: boolean;
  /** Whether "you still can file" may be said (D41). */
  filing: LegacyFilingState;
  officialUrl: string | null;
}

export const GROUP_ORDER: ClaimGroup[] = ['needs_filing', 'in_process', 'reported', 'submitted', 'closed', 'other'];

const FILING_ORDER: Record<LegacyFilingState, number> = {
  open: 0,
  closed_on_list: 1,
  unlisted: 2,
  deadline_passed: 3,
};

/**
 * Notices in the order people should answer them: claims they can still file,
 * soonest deadline first (no deadline after those), then settlements being
 * re-checked, then past deadlines, and the fictional ones last.
 */
export function sortNotices(notices: NoticeItem[]): NoticeItem[] {
  const key = (n: NoticeItem): [number, number, string] => [
    n.kind === 'fictional' ? 1 : 0,
    n.kind === 'fictional' ? 0 : FILING_ORDER[n.filing],
    n.filing === 'open' && n.deadline ? n.deadline : '9999-12-31',
  ];
  return notices
    .map((n, i) => ({ n, i, k: key(n) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2].localeCompare(b.k[2]) || a.i - b.i)
    .map((x) => x.n);
}

export function deadlineText(deadline: string | null, now: Date): string {
  if (!deadline) return 'No deadline listed';
  const countdown = deadlineCountdown(deadline, now);
  if (!countdown) return 'No deadline listed';
  if (countdown === 'Deadline passed') return `Deadline was ${formatDeadline(deadline)}`;
  return `Deadline ${formatDeadline(deadline)} · ${countdown}`;
}

function pinDashboardStep(
  claim: ClaimView,
  settlement: DashboardSettlement,
  href: string | null,
  now: Date,
): { nextStep: string; action: DashboardRow['action'] } | null {
  if (settlement.claim_action_type !== 'needs_notice_id') return null;
  const status = pinAdminStatus({
    notice_id: claim.notice_id,
    pin_admin_email_requested_at: claim.pin_admin_email_requested_at,
    pin_admin_email_sent_at: claim.pin_admin_email_sent_at,
    now,
  });
  if (status.kind === 'paper_fallback') {
    const formHref = paperFormHref({
      formUrl: settlement.claim_action?.form_url,
      officialHref: settlement.claim_url,
      slug: settlement.slug,
    });
    return {
      nextStep: `${PAPER_FALLBACK_HEADING}. ${status.headline ?? ''}`.trim(),
      action: { label: PAPER_FALLBACK_CTA, href: formHref },
    };
  }
  if (status.kind === 'waiting' || status.kind === 'queued') {
    return {
      nextStep: status.headline ?? 'Emailed administrator — waiting on reply',
      action: href ? { label: 'View', href: `${href}#notice-id` } : null,
    };
  }
  return null;
}

export function buildDashboard(
  inputs: { claim: ClaimView; settlement: DashboardSettlement | null }[],
  now: Date,
  isFictional: IsFictional,
): { rows: DashboardRow[]; notices: NoticeItem[] } {
  const rows: DashboardRow[] = [];
  const notices: NoticeItem[] = [];

  for (const { claim, settlement } of inputs) {
    const context = settlementContext(settlement, now, isFictional);
    const display = displayClaimStatus(claim, context);
    if (!settlement) {
      // The settlement could not be read (loadUserClaims fails closed, so this
      // is a backstop). Never guess: no filing guidance and no notice, since
      // the settlement might be one of the fictional ones.
      rows.push({
        claimId: claim.id,
        title: claim.lawsuit_title,
        label: display.label,
        tone: display.tone,
        group: display.group,
        deadlineText: 'Details unavailable',
        nextStep: "We couldn't load this settlement's details. Refresh the page in a minute.",
        action: null,
        timeline: null,
      });
      continue;
    }
    const can = claimActionAvailability(claim, context);
    const title = settlement?.title ?? claim.lawsuit_title;
    const href = settlement ? `/claim/${settlement.slug}` : null;
    const deadline = settlement?.deadline ?? null;
    const lastDay = reportByDay(claim, deadline);
    const tellUs = href ? { label: 'Tell us', href } : null;
    const filing = legacyFilingState(context);
    const legacyStep = legacyNextStep(filing);

    let nextStep: string;
    let action: DashboardRow['action'] = null;
    switch (display.kind) {
      case 'fictional':
        nextStep = 'This settlement was not real. There is nothing to do.';
        break;
      case 'legacy_not_filed':
      case 'legacy_unconfirmed':
        nextStep = legacyStep;
        action = tellUs;
        break;
      case 'self_file':
      case 'not_reported_filed':
        if (display.showNotice) {
          // The old flow showed it as filed and the D38 correction moved it.
          nextStep = legacyStep;
          action = tellUs;
        } else if (context.deadlinePassed || claim.status === 'not_reported_filed') {
          if (can.reportFiled) {
            nextStep = lastDay
              ? `Filed before the deadline? Tell us by ${formatDeadline(lastDay)}.`
              : 'Filed before the deadline? Tell us.';
            action = tellUs;
          } else {
            nextStep = 'The deadline has passed, so this claim can no longer be updated here.';
          }
        } else if (context.closedByStatus) {
          nextStep = 'Our list marks this settlement closed. Check the official site before you file.';
          action = href ? { label: 'How to file', href } : null;
        } else {
          const pin = pinDashboardStep(claim, settlement, href, now);
          if (pin) {
            nextStep = pin.nextStep;
            action = pin.action;
          } else {
            nextStep = deadline
              ? 'If you qualify, file on the official site before the deadline, then tell us.'
              : 'If you qualify, file on the official site, then tell us.';
            action = href ? { label: 'How to file', href } : null;
          }
        }
        break;
      case 'reported_filed':
        nextStep = 'Add your confirmation number when you get it.';
        action = href ? { label: 'Add number', href } : null;
        break;
      case 'submitted':
        nextStep = 'Keep your confirmation number. Check the official site for updates.';
        action = href ? { label: 'View', href } : null;
        break;
      case 'withdrawn':
        nextStep = 'You stopped tracking this claim.';
        break;
      /* The 0041 agent-lane statuses. Each names what happens next so a
         just-submitted claim never reads "We can't show this claim's status".
         The action always points at the filing block, never at "Tell us":
         /api/claims/[id] refuses a self-file report for these statuses. */
      case 'preparing':
        nextStep = 'Add what’s missing and answer the settlement’s questions, then sign.';
        action = href ? { label: 'Finish', href: `${href}#one-click` } : null;
        break;
      case 'ready':
        nextStep = 'Everything is in. Review your claim and sign it.';
        action = href ? { label: 'Review and sign', href: `${href}#one-click` } : null;
        break;
      case 'needs_you':
        nextStep = 'Lawsuit AI needs something from you before this claim can go ahead.';
        action = href ? { label: 'Fix', href: `${href}#one-click` } : null;
        break;
      case 'signed':
        nextStep = 'You signed this. It is being put in line to be filed.';
        action = href ? { label: 'View', href: `${href}#one-click` } : null;
        break;
      case 'queued':
        nextStep = 'Your signed claim is in line. You can still change or withdraw it until filing starts.';
        action = href ? { label: 'View', href: `${href}#one-click` } : null;
        break;
      case 'filing':
        nextStep = 'Filing has started. The confirmation number shows here when the administrator sends it.';
        action = href ? { label: 'View', href: `${href}#one-click` } : null;
        break;
      case 'filed_by_claimmatch':
        nextStep = 'Filed. Waiting for the administrator to send a confirmation number.';
        action = href ? { label: 'View', href: `${href}#one-click` } : null;
        break;
      case 'filing_rejected':
        nextStep = 'The administrator did not accept this claim. You can still finish it yourself before the deadline.';
        action = href ? { label: 'See options', href: `${href}#one-click` } : null;
        break;
      default:
        nextStep = "We can't show this claim's status right now.";
        action = href ? { label: 'View', href } : null;
    }

    rows.push({
      claimId: claim.id,
      title,
      label: display.label,
      tone: display.tone,
      group: display.group,
      deadlineText: display.kind === 'fictional' ? 'No action needed' : deadlineText(deadline, now),
      nextStep,
      action,
      timeline: buildClaimTimeline({
        status: claim.status,
        confirmation_number: claim.confirmation_number,
        user_filed_on: claim.user_filed_on,
        reported_filed_at: claim.reported_filed_at,
        final_approval_hearing_at: settlement.final_approval_hearing_at ?? null,
        payment_timing_text: settlement.payment_timing_text ?? null,
      }),
    });

    if (display.showNotice) {
      notices.push({
        claimId: claim.id,
        title,
        kind: display.kind === 'fictional' ? 'fictional' : 'legacy',
        deadline,
        deadlinePassed: context.deadlinePassed,
        filing,
        officialUrl: officialSiteUrl(settlement?.claim_url),
      });
    }
  }
  return { rows, notices: sortNotices(notices) };
}

export interface DashboardMatch {
  id: string;
  slug: string;
  title: string;
  deadlineText: string;
  reasons: string[];
  strength: MatchStrength;
  label: string;
  officialUrl: string | null;
  score: number;
  matchId?: string;
  isNew?: boolean;
  /** Settlement record payout_min. Null when the listing has no low figure. */
  payoutMin: number | null;
  /** Settlement record payout_max. Null when the listing has no high figure. */
  payoutMax: number | null;
  /**
   * 0051 lawsuits.claim_action_type, for the no-PIN ranking only. Optional and
   * undefined whenever the column is absent or unread; never sent to the app.
   */
  claimActionType?: string | null;
  /** lawsuits.category, for the breach ranking only. Never sent to the app. */
  category?: string | null;
  /** lawsuits.summary, so a mis-categorised breach row is still detectable. */
  summary?: string | null;
}

/** Options shared by both dashboard match builders. */
export interface DashboardMatchOptions {
  /**
   * NO_PIN_BREACH_PRIORITY_ENABLED: within a strength band, put settlements
   * whose official path needs no mailed notice ID first, breach classes
   * first of all. A Possible match never jumps above a Strong one.
   */
  noPinBreachFirst?: boolean;
}

/**
 * The one dashboard match comparator, used by the live and the stored builder
 * so the order cannot depend on whether MATCH_STORE_ENABLED has run.
 */
export function compareDashboardMatches(
  a: DashboardMatch,
  b: DashboardMatch,
  opts: DashboardMatchOptions = {},
): number {
  if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
  if (opts.noPinBreachFirst) {
    const rankA = noPinBreachRank({
      claim_action_type: a.claimActionType,
      category: a.category,
      title: a.title,
      summary: a.summary,
    });
    const rankB = noPinBreachRank({
      claim_action_type: b.claimActionType,
      category: b.category,
      title: b.title,
      summary: b.summary,
    });
    if (rankA !== rankB) return rankA - rankB;
  }
  // Array.prototype.sort is stable, so equal scores keep their input order
  // exactly as they did before this comparator was extracted.
  return b.score - a.score;
}

/** Possible matches shown after Strong; extras stay hidden behind the cap. */
export const POSSIBLE_MATCH_CAP = 20;

export interface GroupedDashboardMatches {
  strong: DashboardMatch[];
  possible: DashboardMatch[];
  possibleHidden: number;
}

export function groupDashboardMatches(
  items: DashboardMatch[],
  possibleCap = POSSIBLE_MATCH_CAP,
): GroupedDashboardMatches {
  const strong = items.filter((item) => item.strength === 'strong');
  const possibleAll = items.filter((item) => item.strength !== 'strong');
  return {
    strong,
    possible: possibleAll.slice(0, possibleCap),
    possibleHidden: Math.max(0, possibleAll.length - possibleCap),
  };
}

export interface ClosingSoonItem {
  id: string;
  slug: string;
  title: string;
  deadline: string;
  deadlineText: string;
  officialUrl: string | null;
}

/**
 * Ranked matches for the signed-in profile. Past-deadline, fictional, and
 * unpublished rows never appear. Strong = score ≥ 0.75; Possible = eligible below that.
 */
export function buildDashboardMatches(
  profile: Pick<Profile, 'state' | 'attributes' | 'facts'>,
  lawsuits: Lawsuit[],
  now: Date,
  isFictional: IsFictional,
  opts: DashboardMatchOptions = {},
): DashboardMatch[] {
  const open = lawsuits.filter(
    (lawsuit) => UUID_RE.test(lawsuit.id) && !isFictional(lawsuit.slug) && isOpenForClaims(lawsuit, now),
  );
  const byId = new Map(open.map((lawsuit) => [lawsuit.id, lawsuit]));
  const scored = matchProfile(profile as Profile, open, 0.4, now).flatMap((result) => {
    const lawsuit = byId.get(result.lawsuit_id);
    if (!lawsuit) return [];
    const strength = matchStrengthFromScore(result.score);
    return [
      {
        id: lawsuit.id,
        slug: lawsuit.slug,
        title: lawsuit.title,
        deadlineText: deadlineText(lawsuit.deadline, now),
        reasons: result.reasons,
        strength,
        label: matchStrengthLabel(strength),
        officialUrl: officialSiteUrl(lawsuit.claim_url),
        score: result.score,
        payoutMin: finitePayoutAmount(lawsuit.payout_min),
        payoutMax: finitePayoutAmount(lawsuit.payout_max),
        claimActionType: lawsuit.claim_action_type ?? null,
        category: lawsuit.category ?? null,
        summary: lawsuit.summary ?? null,
      },
    ];
  });
  return scored.sort((a, b) => compareDashboardMatches(a, b, opts));
}

export function isNewStoredMatch(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= NEW_MATCH_MS;
}

export function buildDashboardMatchesFromStored(
  rows: Array<Match & { lawsuit?: Lawsuit | null }>,
  now: Date,
  isFictional: IsFictional,
  opts: DashboardMatchOptions = {},
): DashboardMatch[] {
  return rows
    .filter((row) => {
      const lawsuit = row.lawsuit;
      if (!lawsuit || row.dismissed) return false;
      if (isFictional(lawsuit.slug)) return false;
      return UUID_RE.test(lawsuit.id) && isOpenForClaims(lawsuit, now);
    })
    .map((row) => {
      const lawsuit = row.lawsuit as Lawsuit;
      const score = Number(row.score) || 0;
      const strength = matchStrengthFromScore(score);
      return {
        id: lawsuit.id,
        slug: lawsuit.slug,
        title: lawsuit.title,
        deadlineText: deadlineText(lawsuit.deadline, now),
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        strength,
        label: matchStrengthLabel(strength),
        officialUrl: officialSiteUrl(lawsuit.claim_url),
        score,
        matchId: row.id,
        isNew: isNewStoredMatch(row.created_at, now),
        payoutMin: finitePayoutAmount(lawsuit.payout_min),
        payoutMax: finitePayoutAmount(lawsuit.payout_max),
        claimActionType: lawsuit.claim_action_type ?? null,
        category: lawsuit.category ?? null,
        summary: lawsuit.summary ?? null,
      };
    })
    .sort((a, b) => compareDashboardMatches(a, b, opts));
}

export function dashboardNeedsProfile(
  profile: Pick<Profile, 'state' | 'attributes' | 'onboarded' | 'facts'>,
): boolean {
  const hasFacts = (profile.facts ?? []).length > 0;
  return !profile.onboarded || (!profileHasMatchSignals(profile) && !hasFacts);
}

/**
 * Open settlements with the nearest deadlines. Only real rows (UUID ids, so a
 * code-only sample can never appear), open for claims, with a deadline, and
 * not already tracked by the user. Ordered and trimmed by pickClosingSoon, the
 * same helper the home page's "Closing soon" module uses.
 */
export function buildClosingSoon(
  lawsuits: DashboardSettlement[],
  trackedLawsuitIds: Set<string>,
  now: Date,
  isFictional: IsFictional,
  limit = 5,
): ClosingSoonItem[] {
  const candidates = lawsuits.filter(
    (l) =>
      UUID_RE.test(l.id) &&
      Boolean(l.deadline) &&
      !trackedLawsuitIds.has(l.id) &&
      !isFictional(l.slug) &&
      isOpenForClaims(l, now),
  );
  return pickClosingSoon(candidates, limit).map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      deadline: l.deadline as string,
      deadlineText: deadlineText(l.deadline, now),
      officialUrl: officialSiteUrl(l.claim_url),
    }));
}
