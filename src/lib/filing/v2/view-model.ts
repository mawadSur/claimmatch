/**
 * Turns a loaded claim (claim-context.ts) into what the member sees: the
 * ClaimFilingView (web and app alike) and the list summary. Pure. Never
 * includes staff identities, notes, internal reason codes or staff-audience
 * Jev issues.
 */
import { needsCorrectiveNotice } from '@/lib/claims';
import { officialSiteUrl } from '@/lib/lawsuit-display';
import { agentAuthorizationText, AGENT_AUTHORIZATION_VERSION } from './authorization-text';
import {
  canMoveClaim,
  FILING_API_VERSION,
  isAgentLane,
  type ClaimFilingSummary,
  type ClaimFilingView,
  type LaneView,
  type PacketDraft,
  type PacketView,
  type TimelineEntry,
} from './contract';
import {
  currentPacketState,
  memberLaneView,
  settlementLane,
  signedPacket,
  type ClaimContext,
  type PacketState,
} from './claim-context';
import { toDocumentView } from './documents';
import { ESIGN_TEXT_V1, ESIGN_TEXT_VERSION } from './esign';
import { buildPacketView } from './packet';
import { tierProofs } from './packet-items';
import { isoTime } from './records';

const ACTION_RE = /^[a-z][a-z0-9_]{0,63}$/;
const NEEDS_ACTION = new Set(['preparing', 'ready', 'needs_you', 'filing_rejected']);
const EDITABLE = new Set(['preparing', 'ready', 'needs_you', 'self_file']);

/** claim_events rows, oldest first. Only the action code of `detail` is shown. */
export function toTimeline(events: Record<string, unknown>[], confirmationNumber: string | null): TimelineEntry[] {
  return events.flatMap((e) => {
    const at = isoTime(e.created_at);
    if (!at || typeof e.to_status !== 'string') return [];
    const detail = e.detail && typeof e.detail === 'object' ? (e.detail as Record<string, unknown>) : {};
    const action = typeof detail.action === 'string' && ACTION_RE.test(detail.action) ? detail.action : null;
    return [
      {
        at,
        status: e.to_status,
        from: typeof e.from_status === 'string' ? e.from_status : null,
        actor: e.actor === 'user' ? 'you' : 'claimmatch',
        action,
        confirmation_number: e.to_status === 'submitted' ? confirmationNumber : null,
      } satisfies TimelineEntry,
    ];
  });
}

/** True when the member has an active E-SIGN consent of the server's current text version. */
export function hasCurrentEsignConsent(ctx: Pick<ClaimContext, 'consents'>): boolean {
  return ctx.consents.some((c) => c.text_version === ESIGN_TEXT_VERSION && c.withdrawn_at === null);
}

interface ViewParts {
  state: PacketState | null;
  lane: LaneView;
  packetView: PacketView | null;
  openForClaims: boolean;
  deadline: string | null;
  daysToDeadline: number | null;
}

function viewParts(ctx: ClaimContext): ViewParts {
  const base = settlementLane(ctx);
  const state = currentPacketState(ctx);
  const lane = memberLaneView(ctx, state, base);
  const laneResult = state?.lane ?? base;
  let packetView: PacketView | null = null;
  if (ctx.packet) {
    const signed = signedPacket(ctx);
    const draft: PacketDraft | null = signed ?? state?.draft ?? null;
    const spec = ctx.packetSpec;
    if (draft) {
      const open = ctx.packet.status === 'open';
      const health = state?.health ?? laneResult.health;
      const text = ctx.env.policy.health_consent_text;
      packetView = buildPacketView({
        packet: {
          id: ctx.packet.id,
          status: ctx.packet.status,
          revision: ctx.packet.revision,
          packet_hash: open ? state?.hash ?? null : ctx.signature?.packet_hash ?? ctx.packet.packet_hash,
        },
        draft,
        spec: spec ? { id: spec.id, version: spec.version, content: spec.content } : null,
        jev: ctx.packet.jev_result,
        documents: ctx.documents.filter((d) => d.status !== 'deleted').map((d) => toDocumentView(d, ctx.now)),
        healthConsentText: health.required && text ? text : null,
        lane: lane.lane,
        profileConsentGiven: Boolean(ctx.profile?.prefill_consent_at),
        daysToDeadline: laneResult.daysToDeadline,
      });
    }
  }
  return {
    state,
    lane,
    packetView,
    openForClaims: laneResult.openForClaims,
    deadline: laneResult.deadline,
    daysToDeadline: laneResult.daysToDeadline,
  };
}

function actionsFor(ctx: ClaimContext, parts: ViewParts, freshSignIn: boolean): ClaimFilingView['actions'] {
  const status = ctx.claim.status;
  const packetOpen = ctx.packet?.status === 'open';
  const canEdit = packetOpen && EDITABLE.has(status) && parts.openForClaims;
  const spec = ctx.packetSpec?.content ?? null;
  const proofs = parts.state ? tierProofs(spec, parts.state.draft.benefit_tier) : [];
  const onApprovedSpec = Boolean(ctx.packet?.spec_id) && ctx.packet?.spec_id === ctx.env.approvedSpec?.id;
  const jevBlocks = ctx.packet?.jev_result?.outcome === 'block';
  const filingOnOurSide = status === 'filing';
  return {
    can_edit: canEdit,
    can_upload: canEdit && proofs.length > 0,
    can_sign:
      status === 'ready' &&
      packetOpen &&
      parts.lane.agent &&
      parts.openForClaims &&
      onApprovedSpec &&
      Boolean(parts.state?.hash) &&
      !jevBlocks,
    can_reopen: (status === 'signed' || status === 'queued') && parts.openForClaims,
    can_withdraw: !filingOnOurSide && Boolean(ctx.packet) && (canMoveClaim(status, 'withdrawn') || status === 'self_file'),
    can_self_file: !filingOnOurSide && Boolean(ctx.packet) && canMoveClaim(status, 'self_file'),
    can_add_confirmation: status === 'filed_by_claimmatch',
    needs_esign_consent: parts.lane.agent && !hasCurrentEsignConsent(ctx),
    needs_fresh_sign_in: !freshSignIn,
  };
}

/** The member's ClaimFilingView of one loaded claim. */
export function buildClaimFilingView(ctx: ClaimContext, freshSignIn: boolean): ClaimFilingView {
  const parts = viewParts(ctx);
  const { claim, env, signature } = ctx;
  const lane = parts.lane;
  const authorizationLane = signature && lane.lane === signature.lane ? signature.lane : lane.lane;
  return {
    api_version: FILING_API_VERSION,
    server_time: ctx.now.toISOString(),
    claim: {
      id: claim.id,
      lawsuit_id: claim.lawsuit_id,
      status: claim.status,
      confirmation_number: claim.confirmation_number,
      updated_at: claim.updated_at ?? claim.created_at ?? ctx.now.toISOString(),
    },
    settlement: {
      id: env.settlement.id,
      slug: env.settlement.slug,
      title: env.settlement.title,
      deadline: parts.deadline,
      deadline_passed: env.context.deadlinePassed || (parts.daysToDeadline !== null && parts.daysToDeadline < 0),
      official_url: officialSiteUrl(env.settlement.claim_url),
    },
    lane,
    packet: parts.packetView,
    timeline: toTimeline(ctx.events, claim.confirmation_number),
    actions: actionsFor(ctx, parts, freshSignIn),
    esign: { text_version: ESIGN_TEXT_VERSION, text: ESIGN_TEXT_V1, consented: hasCurrentEsignConsent(ctx) },
    authorization: isAgentLane(authorizationLane)
      ? { text_version: AGENT_AUTHORIZATION_VERSION, text: agentAuthorizationText(authorizationLane) }
      : null,
    signature: signature
      ? {
          id: signature.id,
          signed_at: signature.signed_at,
          typed_name: signature.typed_name,
          packet_hash: signature.packet_hash,
          lane: signature.lane,
        }
      : null,
  };
}

/** The list entry for one loaded claim. */
export function claimSummary(ctx: ClaimContext): ClaimFilingSummary {
  const parts = viewParts(ctx);
  return {
    claim_id: ctx.claim.id,
    lawsuit_id: ctx.claim.lawsuit_id,
    slug: ctx.env.settlement.slug,
    title: ctx.env.settlement.title,
    status: ctx.claim.status,
    lane: parts.lane.lane,
    agent: parts.lane.agent,
    deadline: parts.deadline,
    confirmation_number: ctx.claim.confirmation_number,
    needs_action: NEEDS_ACTION.has(ctx.claim.status),
    updated_at: ctx.claim.updated_at ?? ctx.claim.created_at ?? ctx.now.toISOString(),
  };
}

/** Whether POST /api/filing/claims may start or resume a one-click claim on this claim's state. */
export function startableStatus(claim: ClaimContext['claim'] | null): 'start' | 'resume' | 'already_filed' | 'blocked' {
  if (!claim) return 'start';
  if (claim.status === 'self_file') return needsCorrectiveNotice(claim.view) ? 'blocked' : 'resume';
  if (['preparing', 'ready', 'signed', 'queued', 'filing', 'filed_by_claimmatch', 'needs_you', 'filing_rejected'].includes(claim.status)) {
    return 'resume';
  }
  if (['reported_filed', 'submitted', 'not_reported_filed'].includes(claim.status) && !needsCorrectiveNotice(claim.view)) {
    return 'already_filed';
  }
  return 'blocked';
}
