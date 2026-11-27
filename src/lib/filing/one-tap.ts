/**
 * 1-tap Easy submit: when every required packet field is already filled and
 * valid, the member sees a compact summary and one submit action instead of
 * the three-step wizard. Pure, so tests cover the decision.
 */
import type { ClaimFilingSummary, ClaimFilingView, PacketItemView } from './v2/contract';
import { isAgentLane } from './v2/contract';

function isIntakeStatus(status: string): boolean {
  return status === 'preparing' || status === 'ready' || status === 'needs_you';
}

/** A required item the member still has to fill before 1-tap can run. */
export function requiredItemUnfilled(item: PacketItemView): boolean {
  if (!item.required) return false;
  if (item.missing) return true;
  if (item.kind === 'document') {
    const stored = item.proof?.documents.filter((doc) => doc.status === 'stored').length ?? 0;
    return stored < (item.proof?.min_files ?? 1);
  }
  if (item.value === null || item.value === undefined || item.value === '') return true;
  if (Array.isArray(item.value) && item.value.length === 0) return true;
  return false;
}

function blockingIssues(view: ClaimFilingView) {
  const packet = view.packet;
  const issues = [
    ...(packet?.items.flatMap((item) => item.issues.filter((issue) => issue.severity === 'block')) ?? []),
    ...(packet?.jev?.issues.filter((issue) => issue.severity === 'block') ?? []),
  ];
  return issues.filter(
    (issue, i, all) => all.findIndex((other) => other.rule_id === issue.rule_id && other.field === issue.field) === i,
  );
}

/**
 * Known profile / claim-profile (and this settlement's answers) are already
 * filled and valid: show the compact 1-tap screen. Missing required fields,
 * health consent, or blocking Jev issues keep the full wizard.
 */
export function oneTapReady(view: ClaimFilingView): boolean {
  const packet = view.packet;
  if (!packet || packet.status !== 'open' || !packet.spec) return false;
  if (!isIntakeStatus(view.claim.status)) return false;
  if (!view.lane.agent || !isAgentLane(view.lane.lane)) return false;
  if (packet.health_consent_text && packet.choices.health_consent !== true) return false;
  if (packet.items.some(requiredItemUnfilled)) return false;
  return blockingIssues(view).length === 0;
}

export interface NextEasySubmit {
  slug: string;
  title: string;
  href: string;
}

/** Another Easy submit claim this member can move into after signing. */
export function pickNextEasySubmit(
  items: readonly ClaimFilingSummary[],
  exceptClaimId: string | null | undefined,
): NextEasySubmit | null {
  const next = items.find(
    (item) =>
      item.claim_id !== exceptClaimId &&
      item.agent &&
      (item.status === 'preparing' || item.status === 'ready'),
  );
  if (!next) return null;
  return { slug: next.slug, title: next.title, href: `/claim/${next.slug}#one-click` };
}

/** Statuses where "Submit next claim" belongs on the confirmation card. */
export function showNextEasySubmitCta(status: string): boolean {
  return (
    status === 'signed' ||
    status === 'queued' ||
    status === 'filing' ||
    status === 'filed_by_claimmatch' ||
    status === 'submitted'
  );
}
