/**
 * The one-click filing UI's view model: status labels, lane copy, the status
 * path and timeline, and whether "File my claim" can be pressed. Pure (no
 * React, no network), so tests/filing-ui-model.test.ts covers the decisions.
 * Every shape comes from the member API contract; every string from
 * src/lib/copy.ts.
 */
import {
  ONE_CLICK_AGENT_NOTE,
  ONE_CLICK_AGENT_TITLE,
  ONE_CLICK_COPY,
  ONE_CLICK_EVENTS,
  ONE_CLICK_LANE_REASONS,
  ONE_CLICK_SELF_FILE_NOTE,
  ONE_CLICK_SELF_FILE_TITLE,
  ONE_CLICK_STATUS,
  ONE_CLICK_TIMING,
} from '@/lib/copy';
import {
  AGENT_CLAIM_STATUSES,
  isAgentLane,
  normalizeTypedName,
  type AgentClaimStatus,
  type ClaimFilingSummary,
  type ClaimFilingView,
  type JevIssueView,
  type LaneView,
  type PacketItemView,
  type PacketView,
  type TimelineEntry,
} from '@/lib/filing/v2/contract';
import { displayConfirmationNumber, type ClaimTone, type ClaimView } from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';

const AGENT_STATUS_SET = new Set<string>(AGENT_CLAIM_STATUSES);

/** A claim status that only the one-click flow uses (the self-file statuses keep their screens). */
export function isOneClickStatus(status: string | null | undefined): status is AgentClaimStatus {
  return typeof status === 'string' && AGENT_STATUS_SET.has(status);
}

/** The packet can still be edited by the member: the intake steps show. */
export function isIntakeStatus(status: string): boolean {
  return status === 'preparing' || status === 'ready' || status === 'needs_you';
}

export interface FilingStatusDisplay {
  label: string;
  tone: ClaimTone;
  detail: string | null;
}

const TONES: Record<string, ClaimTone> = {
  preparing: 'amber',
  ready: 'brand',
  signed: 'brand',
  queued: 'brand',
  filing: 'brand',
  filed_by_claimmatch: 'brand',
  needs_you: 'red',
  filing_rejected: 'red',
  submitted: 'green',
  withdrawn: 'gray',
  self_file: 'amber',
};

/** The label for a claim status as the one-click screens show it. */
export function filingStatusDisplay(status: string, confirmationNumber: string | null): FilingStatusDisplay {
  const known = (ONE_CLICK_STATUS as Record<string, { label: string; detail: string }>)[status];
  if (!known) return { label: ONE_CLICK_COPY.timeline.other, tone: 'gray', detail: null };
  if (status === 'submitted') {
    const number = confirmationNumber?.trim() ? displayConfirmationNumber(confirmationNumber) : null;
    return { label: number ? `${known.label} · #${number}` : known.label, tone: 'green', detail: known.detail };
  }
  return { label: known.label, tone: TONES[status] ?? 'gray', detail: known.detail };
}

/** "Lawsuit AI files this claim for you" only on an agent lane; otherwise "Finish on the official site". */
export function laneTitle(lane: LaneView | null): string {
  return lane && lane.agent && isAgentLane(lane.lane) ? ONE_CLICK_AGENT_TITLE : ONE_CLICK_SELF_FILE_TITLE;
}

/**
 * The claim page's status note while one-click filing is on: the agent note
 * only where Lawsuit AI files this claim (an agent lane being prepared or
 * offered, or a signed claim on its way); otherwise the self-file note.
 */
export function claimPageNote(args: { status: string | null; lane: LaneView | null; offerStart: boolean }): string {
  const { status, lane, offerStart } = args;
  const agentLane = Boolean(lane?.agent && isAgentLane(lane.lane));
  if (status === 'signed' || status === 'queued' || status === 'filing' || status === 'filed_by_claimmatch') {
    return ONE_CLICK_AGENT_NOTE;
  }
  if (status && isIntakeStatus(status)) return agentLane ? ONE_CLICK_AGENT_NOTE : ONE_CLICK_SELF_FILE_NOTE;
  return offerStart && agentLane ? ONE_CLICK_AGENT_NOTE : ONE_CLICK_SELF_FILE_NOTE;
}

/** What happens after signing on this lane; null on self_file. */
export function laneTiming(lane: LaneView | null): string | null {
  if (!lane || !lane.agent || !isAgentLane(lane.lane)) return null;
  return ONE_CLICK_TIMING[lane.lane];
}

/** Why Lawsuit AI can't file this claim, in member-safe words (deduplicated, in order). */
export function laneReasonLines(lane: LaneView | null): string[] {
  if (!lane || lane.agent) return [];
  return [...new Set(lane.reasons)].map((reason) => ONE_CLICK_LANE_REASONS[reason]);
}

/** "Sign by <date> …" while an agent lane has a cutoff; null otherwise. */
export function lastDayLine(lane: LaneView | null): string | null {
  if (!lane || !lane.agent || !lane.last_day_for_agent) return null;
  return ONE_CLICK_COPY.lastDay(formatDeadline(lane.last_day_for_agent));
}

/** The path a one-click claim takes; off-path statuses (needs_you, rejected, withdrawn) show alone. */
export const FILING_PATH = ['preparing', 'ready', 'signed', 'queued', 'filing', 'filed_by_claimmatch', 'submitted'] as const;

export interface PathStep {
  status: (typeof FILING_PATH)[number];
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

const PATH_LABELS: Record<(typeof FILING_PATH)[number], string> = {
  preparing: 'Preparing',
  ready: 'Ready to file',
  signed: 'Signed',
  queued: 'In line',
  filing: 'Filing',
  filed_by_claimmatch: 'Filed',
  submitted: 'Confirmation number',
};

/** The status path with the claim's place on it; needs_you sits at "Preparing"; null off the path. */
export function filingPath(status: string): PathStep[] | null {
  const at = status === 'needs_you' ? 'preparing' : status;
  const index = (FILING_PATH as readonly string[]).indexOf(at);
  if (index < 0) return null;
  return FILING_PATH.map((step, i) => ({
    status: step,
    label: PATH_LABELS[step],
    state: i < index ? 'done' : i === index ? (step === 'submitted' ? 'done' : 'current') : 'upcoming',
  }));
}

/** Date and time in Eastern time, the same on the server and in the browser. */
export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const text = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${text} ET`;
}

export interface TimelineRow {
  key: string;
  at: string;
  when: string;
  actor: string;
  text: string;
  confirmation: string | null;
}

/** claim_events rows as the member reads them, oldest first (the order the API sends). */
export function timelineRows(entries: readonly TimelineEntry[]): TimelineRow[] {
  return entries.map((entry, i) => ({
    key: `${entry.at}-${i}`,
    at: entry.at,
    when: formatEventTime(entry.at),
    actor: entry.actor === 'you' ? ONE_CLICK_COPY.timeline.you : ONE_CLICK_COPY.timeline.claimmatch,
    text: ONE_CLICK_EVENTS[entry.status] ?? ONE_CLICK_COPY.timeline.other,
    confirmation: entry.confirmation_number?.trim() ? displayConfirmationNumber(entry.confirmation_number) : null,
  }));
}

/** True when the claim went through one-click (an agent status in its history or a signature). */
export function hasOneClickHistory(view: ClaimFilingView | null): boolean {
  if (!view) return false;
  return Boolean(view.signature) || view.timeline.some((entry) => isOneClickStatus(entry.status));
}

/** The claim as ClaimFlow tracks it, after a one-click change. */
export function claimViewFromFiling(view: ClaimFilingView, current: ClaimView | null): ClaimView {
  return {
    id: view.claim.id,
    lawsuit_id: view.claim.lawsuit_id,
    lawsuit_title: current?.lawsuit_title ?? view.settlement.title,
    status: view.claim.status,
    confirmation_number: view.claim.confirmation_number,
    reported_filed_at: current?.reported_filed_at ?? null,
    user_filed_on: current?.user_filed_on ?? null,
    corrective_notice_answered_at: current?.corrective_notice_answered_at ?? null,
    corrective_notice_required: current?.corrective_notice_required ?? false,
    created_at: current?.created_at ?? view.claim.updated_at,
  };
}

/** The packet's legal name (what the typed signature must equal). */
export function packetLegalName(packet: PacketView | null): string | null {
  const item = packet?.items.find((i) => i.path === 'member.legal_name');
  return typeof item?.value === 'string' && item.value.trim() ? item.value : null;
}

/** The typed signature equals the legal name after normalizeTypedName (the server checks it again). */
export function typedNameMatches(typed: string, legalName: string | null): boolean {
  if (!legalName) return false;
  const normalized = normalizeTypedName(typed);
  return normalized.length >= 2 && normalized === normalizeTypedName(legalName);
}

export interface SignReadiness {
  /** The server says the claim can be signed now (status ready on an agent lane). */
  canSign: boolean;
  /** Items still missing, in the official order. */
  missing: PacketItemView[];
  /** Member-audience issues that stop signing. */
  blocking: JevIssueView[];
}

export function signReadiness(view: ClaimFilingView): SignReadiness {
  const packet = view.packet;
  const missing = packet ? packet.items.filter((item) => item.missing && item.required) : [];
  const blocking = [
    ...(packet?.items.flatMap((item) => item.issues.filter((issue) => issue.severity === 'block')) ?? []),
    ...(packet?.jev?.issues.filter((issue) => issue.severity === 'block') ?? []),
  ].filter((issue, i, all) => all.findIndex((other) => other.rule_id === issue.rule_id && other.field === issue.field) === i);
  const canSign = Boolean(
    packet &&
      packet.status === 'open' &&
      packet.complete &&
      packet.packet_hash &&
      packet.spec &&
      view.lane.agent &&
      view.actions.can_sign,
  );
  return { canSign, missing, blocking };
}

/** Dashboard: one-click claims only (the self-file ones stay in "Your claims"). */
export function oneClickSummaries(items: readonly ClaimFilingSummary[]): ClaimFilingSummary[] {
  return items.filter((item) => isOneClickStatus(item.status));
}

/** "Ready to file" and "needs your attention" counts for the dashboard. */
export function summaryCounts(items: readonly ClaimFilingSummary[]): { ready: number; needsYou: number } {
  return {
    ready: items.filter((item) => item.status === 'ready').length,
    needsYou: items.filter((item) => item.status === 'needs_you' || item.status === 'filing_rejected').length,
  };
}
