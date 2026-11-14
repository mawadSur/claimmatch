/**
 * Rows the member filing API reads, parsed leniently and typed: claims,
 * packets, signatures, consents, events, specs, policies and controls.
 * Column lists keep every select explicit. Pure.
 */
import { toClaimView, type ClaimView } from '@/lib/claims';
import { JEV_MODES, JEV_OUTCOMES, JevIssueSchema, type JevIssue, type JevResult } from '../../jev/types';
import { readMemberSnapshot, type MemberSnapshot } from './answers';
import { LANES, PACKET_STATUSES, type AnswerValue, type Lane, type PacketStatus } from './contract';
import {
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  SPEC_STATUSES,
  type FilingControlsRecord,
  type FilingPolicyRecord,
  type FilingSpecContent,
  type SpecStatus,
} from './contract-spec';
import { sha256Hex } from './packet';

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** ISO 8601 with an offset (z.string().datetime({ offset: true }) accepts it), or null. */
export function isoTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface ClaimRecord {
  id: string;
  user_id: string;
  lawsuit_id: string;
  status: string;
  confirmation_number: string | null;
  updated_at: string | null;
  created_at: string | null;
  view: ClaimView;
}

export function toClaimRecord(row: Record<string, unknown>): ClaimRecord {
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    lawsuit_id: String(row.lawsuit_id ?? ''),
    status: String(row.status ?? ''),
    confirmation_number: str(row.confirmation_number),
    updated_at: isoTime(row.updated_at),
    created_at: isoTime(row.created_at),
    view: toClaimView(row),
  };
}

export const PACKET_COLUMNS =
  'id, claim_id, user_id, lawsuit_id, spec_id, spec_version, status, revision, answers, member_snapshot, benefit_tier, payout_method, class_definition_confirmed_at, health_consent_at, health_consent_text_sha256, packet_hash, jev_outcome, jev_result, jev_checked_at, signature_id, signed_at, updated_at';

export interface PacketRecord {
  id: string;
  claim_id: string;
  user_id: string;
  lawsuit_id: string;
  spec_id: string | null;
  spec_version: number | null;
  status: PacketStatus;
  revision: number;
  answers: Record<string, AnswerValue>;
  member_snapshot: MemberSnapshot;
  benefit_tier: string | null;
  payout_method: string | null;
  class_definition_confirmed_at: string | null;
  health_consent_at: string | null;
  health_consent_text_sha256: string | null;
  packet_hash: string | null;
  jev_result: JevResult | null;
  signature_id: string | null;
  signed_at: string | null;
}

function isAnswerValue(value: unknown): value is AnswerValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function readAnswers(raw: unknown): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z][a-z0-9_]{0,63}$/.test(key) && isAnswerValue(value)) out[key] = value;
  }
  return out;
}

/** The member-audience Jev result kept on a packet (claim_packets.jev_result), or null. */
export function readStoredJev(raw: unknown): JevResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!(JEV_MODES as readonly unknown[]).includes(r.mode) || !(JEV_OUTCOMES as readonly unknown[]).includes(r.outcome)) {
    return null;
  }
  const evaluatedAt = isoTime(r.evaluated_at);
  if (!evaluatedAt) return null;
  const issues: JevIssue[] = Array.isArray(r.issues)
    ? r.issues.flatMap((i) => {
        const parsed = JevIssueSchema.safeParse(i);
        return parsed.success && parsed.data.audience === 'member' ? [parsed.data] : [];
      })
    : [];
  const count = (s: JevIssue['severity']) => issues.filter((i) => i.severity === s).length;
  return {
    engine_version: typeof r.engine_version === 'string' ? r.engine_version : '',
    mode: r.mode as JevResult['mode'],
    outcome: r.outcome as JevResult['outcome'],
    issues,
    counts: { block: count('block'), warn: count('warn'), info: count('info') },
    rule_set_hash: typeof r.rule_set_hash === 'string' ? r.rule_set_hash : '',
    packet_hash: str(r.packet_hash),
    evaluated_at: evaluatedAt,
  };
}

export function toPacketRecord(row: Record<string, unknown>): PacketRecord {
  const status = (PACKET_STATUSES as readonly unknown[]).includes(row.status) ? (row.status as PacketStatus) : 'closed';
  return {
    id: String(row.id ?? ''),
    claim_id: String(row.claim_id ?? ''),
    user_id: String(row.user_id ?? ''),
    lawsuit_id: String(row.lawsuit_id ?? ''),
    spec_id: str(row.spec_id),
    spec_version: typeof row.spec_version === 'number' ? row.spec_version : null,
    status,
    revision: typeof row.revision === 'number' && row.revision >= 1 ? row.revision : 1,
    answers: readAnswers(row.answers),
    member_snapshot: readMemberSnapshot(row.member_snapshot),
    benefit_tier: str(row.benefit_tier),
    payout_method: str(row.payout_method),
    class_definition_confirmed_at: isoTime(row.class_definition_confirmed_at),
    health_consent_at: isoTime(row.health_consent_at),
    health_consent_text_sha256: str(row.health_consent_text_sha256),
    packet_hash: str(row.packet_hash),
    jev_result: readStoredJev(row.jev_result),
    signature_id: str(row.signature_id),
    signed_at: isoTime(row.signed_at),
  };
}

export const SIGNATURE_COLUMNS =
  'id, claim_id, packet_id, spec_id, spec_version, packet_hash, packet_canonical, statement_sha256, typed_name, lane, authorization_text_version, signed_at';

export interface SignatureRecord {
  id: string;
  claim_id: string;
  packet_id: string;
  spec_id: string;
  spec_version: number;
  packet_hash: string;
  packet_canonical: string;
  statement_sha256: string;
  typed_name: string;
  lane: Lane;
  authorization_text_version: string;
  signed_at: string;
}

export function toSignatureRecord(row: Record<string, unknown>): SignatureRecord | null {
  const lane = row.lane;
  const signedAt = isoTime(row.signed_at);
  if (!(LANES as readonly unknown[]).includes(lane) || !signedAt || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    claim_id: String(row.claim_id ?? ''),
    packet_id: String(row.packet_id ?? ''),
    spec_id: String(row.spec_id ?? ''),
    spec_version: Number(row.spec_version ?? 0),
    packet_hash: String(row.packet_hash ?? ''),
    packet_canonical: String(row.packet_canonical ?? ''),
    statement_sha256: String(row.statement_sha256 ?? ''),
    typed_name: String(row.typed_name ?? ''),
    lane: lane as Lane,
    authorization_text_version: String(row.authorization_text_version ?? ''),
    signed_at: signedAt,
  };
}

/** The newest signature of the claim that has no void row. */
export function liveSignature(rows: Record<string, unknown>[], voidedIds: Set<string>): SignatureRecord | null {
  const live = rows
    .map(toSignatureRecord)
    .filter((s): s is SignatureRecord => s !== null && !voidedIds.has(s.id))
    .sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1));
  return live[0] ?? null;
}

export const CONSENT_COLUMNS = 'id, text_version, consented_at, withdrawn_at';

export interface ConsentRecord {
  id: string;
  text_version: string;
  consented_at: string;
  withdrawn_at: string | null;
}

export function toConsentRecord(row: Record<string, unknown>): ConsentRecord | null {
  const consentedAt = isoTime(row.consented_at);
  if (typeof row.id !== 'string' || typeof row.text_version !== 'string' || !consentedAt) return null;
  return { id: row.id, text_version: row.text_version, consented_at: consentedAt, withdrawn_at: isoTime(row.withdrawn_at) };
}

export const EVENT_COLUMNS = 'created_at, from_status, to_status, actor, detail';

export const SPEC_COLUMNS = 'id, lawsuit_id, version, status, content';

export interface SpecRecord {
  id: string;
  lawsuit_id: string;
  version: number;
  status: SpecStatus;
  content: FilingSpecContent;
  attestation_sha256: string;
  class_definition_sha256: string;
}

/** A spec row with valid content, or null (a spec that does not parse is treated as absent: self_file). */
export function toSpecRecord(row: Record<string, unknown> | null | undefined): SpecRecord | null {
  if (!row || typeof row.id !== 'string' || !(SPEC_STATUSES as readonly unknown[]).includes(row.status)) return null;
  const content = FilingSpecContentSchema.safeParse(row.content);
  if (!content.success || typeof row.version !== 'number') return null;
  return {
    id: row.id,
    lawsuit_id: String(row.lawsuit_id ?? ''),
    version: row.version,
    status: row.status as SpecStatus,
    content: content.data,
    attestation_sha256: sha256Hex(content.data.attestation.text),
    class_definition_sha256: sha256Hex(content.data.class_definition.text),
  };
}

export const POLICY_COLUMNS =
  'id, lawsuit_id, administrator_id, version, status, agent_filing, channels, agent_certification_allowed, allowed_states, health_sensitive, health_consent_text, identity_check_required, sources_reviewed, notes, approved_by, approved_at';

/** An approved policy row, or 'invalid' when it does not parse (callers then fail closed). */
export function toPolicyRecord(row: Record<string, unknown>): FilingPolicyRecord | 'invalid' {
  const content = FilingPolicyContentSchema.safeParse({
    agent_filing: row.agent_filing ?? undefined,
    channels: row.channels ?? undefined,
    agent_certification_allowed: row.agent_certification_allowed ?? undefined,
    allowed_states: row.allowed_states ?? null,
    health_sensitive: row.health_sensitive ?? undefined,
    health_consent_text: row.health_consent_text ?? null,
    identity_check_required: row.identity_check_required ?? undefined,
    sources_reviewed: row.sources_reviewed ?? undefined,
    notes: row.notes ?? null,
  });
  if (!content.success || typeof row.id !== 'string' || row.status !== 'approved') return 'invalid';
  return {
    ...content.data,
    id: row.id,
    lawsuit_id: str(row.lawsuit_id),
    administrator_id: str(row.administrator_id),
    version: Number(row.version ?? 1),
    status: 'approved',
    approved_by: str(row.approved_by),
    approved_at: isoTime(row.approved_at),
  };
}

export const CONTROLS_COLUMNS = 'lawsuit_id, administrator_id, kill_switch, kill_switch_reason, objection_received_at';

export function toControlsRecord(row: Record<string, unknown>): FilingControlsRecord {
  return {
    lawsuit_id: str(row.lawsuit_id),
    administrator_id: str(row.administrator_id),
    kill_switch: row.kill_switch === true,
    kill_switch_reason: str(row.kill_switch_reason),
    objection_received_at: isoTime(row.objection_received_at),
  };
}
