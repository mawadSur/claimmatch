/**
 * The app's one-click filing view model, the same decisions as the web's
 * src/components/filing/filing-model.ts: status labels, lane copy, the
 * status path and timeline, and whether "File my claim" can be pressed. Pure
 * (no React, no network). Shapes come from the shared member API contract;
 * every string from ../../copy/filing.
 */
import {
  AGENT_CLAIM_STATUSES,
  isAgentLane,
  normalizeTypedName,
  type AgentClaimStatus,
  type ClaimFilingView,
  type JevIssueView,
  type LaneView,
  type PacketItemView,
  type PacketView,
  type TimelineEntry,
} from '@shared/lib/filing/v2/contract';
import { displayConfirmationNumber, type ClaimTone, type ClaimView } from '@shared/lib/claims';
import { formatDeadline } from '@shared/lib/utils';

import { filing as copy, filingEvents, lastDaySentence } from '@/copy/filing';

import { FILING_EVENT_COPY, FILING_STATUS_COPY, LANE_REASON_COPY, LANE_TIMING_COPY } from './copy-maps';

const AGENT_STATUS_SET = new Set<string>(AGENT_CLAIM_STATUSES);

/** A claim status only the one-click flow uses (the self-file statuses keep their screens). */
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

export function filingStatusDisplay(status: string, confirmationNumber: string | null): FilingStatusDisplay {
  const known = FILING_STATUS_COPY[status];
  if (!known) return { label: copy.timelineOther.text, tone: 'gray', detail: null };
  if (status === 'submitted') {
    const number = confirmationNumber?.trim() ? displayConfirmationNumber(confirmationNumber) : null;
    return { label: number ? `${known.label} · #${number}` : known.label, tone: 'green', detail: known.detail };
  }
  return { label: known.label, tone: TONES[status] ?? 'gray', detail: known.detail };
}

function agentLane(lane: LaneView | null): lane is LaneView {
  return Boolean(lane && lane.agent && isAgentLane(lane.lane));
}

export function laneTitle(lane: LaneView | null): string {
  return agentLane(lane) ? copy.agentTitle.text : copy.selfFileTitle.text;
}

/** The status note at the top of the claim screen while one-click filing is on. */
export function claimNote(args: { status: string | null; lane: LaneView | null; offerStart: boolean }): string {
  const { status, lane, offerStart } = args;
  const agent = agentLane(lane);
  if (status === 'signed' || status === 'queued' || status === 'filing' || status === 'filed_by_claimmatch') {
    return copy.agentNote.text;
  }
  if (status && isIntakeStatus(status)) return agent ? copy.agentNote.text : copy.selfFileNote.text;
  return offerStart && agent ? copy.agentNote.text : copy.selfFileNote.text;
}

export function laneTiming(lane: LaneView | null): string | null {
  if (!agentLane(lane)) return null;
  return LANE_TIMING_COPY[lane.lane as keyof typeof LANE_TIMING_COPY] ?? null;
}

export function laneReasonLines(lane: LaneView | null): string[] {
  if (!lane || lane.agent) return [];
  return [...new Set(lane.reasons)].map((reason) => LANE_REASON_COPY[reason]);
}

export function lastDayLine(lane: LaneView | null): string | null {
  if (!lane || !lane.agent || !lane.last_day_for_agent) return null;
  return lastDaySentence(formatDeadline(lane.last_day_for_agent));
}

export const FILING_PATH = ['preparing', 'ready', 'signed', 'queued', 'filing', 'filed_by_claimmatch', 'submitted'] as const;

export interface PathStep {
  status: (typeof FILING_PATH)[number];
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

const PATH_LABELS: Record<(typeof FILING_PATH)[number], string> = {
  preparing: filingEvents.pathPreparing.text,
  ready: filingEvents.pathReady.text,
  signed: filingEvents.pathSigned.text,
  queued: filingEvents.pathQueued.text,
  filing: filingEvents.pathFiling.text,
  filed_by_claimmatch: filingEvents.pathFiled.text,
  submitted: filingEvents.pathSubmitted.text,
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

/** Date and time in Eastern time, as the web shows it. */
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
  when: string;
  actor: string;
  text: string;
  confirmation: string | null;
}

export function timelineRows(entries: readonly TimelineEntry[]): TimelineRow[] {
  return entries.map((entry, i) => ({
    key: `${entry.at}-${i}`,
    when: formatEventTime(entry.at),
    actor: entry.actor === 'you' ? copy.timelineYou.text : copy.timelineLawsuitAi.text,
    text: FILING_EVENT_COPY[entry.status] ?? copy.timelineOther.text,
    confirmation: entry.confirmation_number?.trim() ? displayConfirmationNumber(entry.confirmation_number) : null,
  }));
}

export function hasOneClickHistory(view: ClaimFilingView | null): boolean {
  if (!view) return false;
  return Boolean(view.signature) || view.timeline.some((entry) => isOneClickStatus(entry.status));
}

/** The claim as the claim screen keeps it, after a one-click change. */
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

export function packetLegalName(packet: PacketView | null): string | null {
  const item = packet?.items.find((i) => i.path === 'member.legal_name');
  return typeof item?.value === 'string' && item.value.trim() ? item.value : null;
}

export function typedNameMatches(typed: string, legalName: string | null): boolean {
  if (!legalName) return false;
  const normalized = normalizeTypedName(typed);
  return normalized.length >= 2 && normalized === normalizeTypedName(legalName);
}

export interface SignReadiness {
  canSign: boolean;
  missing: PacketItemView[];
  blocking: JevIssueView[];
}

/** Jev's results before signing: what is still missing and what stops the signature. */
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
