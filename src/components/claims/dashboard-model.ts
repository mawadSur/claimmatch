/**
 * The dashboard's view model: ranked matches, the user's claims grouped by
 * next step, the corrective notices, and a "Closing soon" catalog module.
 * Pure, so the decisions are tested in tests/claims-dashboard.test.ts.
 */
import {
  claimActionAvailability,
  deadlineCountdown,
  displayClaimStatus,
  isOpenForClaims,
  legacyFilingState,
  legacyNextStep,
  reportByDay,
  safeExternalUrl,
  settlementContext,
  type ClaimGroup,
  type LegacyFilingState,
  type ClaimTone,
  type ClaimView,
  type IsFictional,
  type SettlementFacts,
} from '@/lib/claims';
import { pickClosingSoon } from '@/lib/closing-soon';
import {
  classifyMatch,
  matchProfile,
  matchStrengthLabel,
  type MatchStrength,
} from '@/lib/matching';
import { profileHasMatchSignals } from '@/lib/profile-attributes';
import type { Lawsuit, Profile } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DashboardSettlement extends SettlementFacts {
  id: string;
  title: string;
  claim_url: string | null;
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

export const GROUP_ORDER: ClaimGroup[] = ['needs_filing', 'reported', 'submitted', 'closed', 'other'];

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
          nextStep = deadline
            ? 'If you qualify, file on the official site before the deadline, then tell us.'
            : 'If you qualify, file on the official site, then tell us.';
          action = href ? { label: 'How to file', href } : null;
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
    });

    if (display.showNotice) {
      notices.push({
        claimId: claim.id,
        title,
        kind: display.kind === 'fictional' ? 'fictional' : 'legacy',
        deadline,
        deadlinePassed: context.deadlinePassed,
        filing,
        officialUrl: safeExternalUrl(settlement?.claim_url),
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
 * unpublished rows never appear. Strong = rule-verified; Possible =
 * heuristic or state-only.
 */
export function buildDashboardMatches(
  profile: Pick<Profile, 'state' | 'attributes'>,
  lawsuits: Lawsuit[],
  now: Date,
  isFictional: IsFictional,
): DashboardMatch[] {
  const open = lawsuits.filter(
    (lawsuit) => UUID_RE.test(lawsuit.id) && !isFictional(lawsuit.slug) && isOpenForClaims(lawsuit, now),
  );
  const byId = new Map(open.map((lawsuit) => [lawsuit.id, lawsuit]));
  return matchProfile(profile as Profile, open, 0.4, now).flatMap((result) => {
    const lawsuit = byId.get(result.lawsuit_id);
    if (!lawsuit) return [];
    const strength = classifyMatch(lawsuit);
    return [
      {
        id: lawsuit.id,
        slug: lawsuit.slug,
        title: lawsuit.title,
        deadlineText: deadlineText(lawsuit.deadline, now),
        reasons: result.reasons,
        strength,
        label: matchStrengthLabel(strength),
        officialUrl: safeExternalUrl(lawsuit.claim_url),
      },
    ];
  });
}

export function dashboardNeedsProfile(
  profile: Pick<Profile, 'state' | 'attributes' | 'onboarded'>,
): boolean {
  return !profile.onboarded || !profileHasMatchSignals(profile);
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
      officialUrl: safeExternalUrl(l.claim_url),
    }));
}
