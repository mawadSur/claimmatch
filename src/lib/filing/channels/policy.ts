/**
 * The filing policy in force for one settlement (resolveEffectivePolicy) and
 * the parsers that turn filing_policies / filing_controls rows into records.
 * Pure. Rules: docs/designs/one-click-filing.md, section 8. Any doubt
 * resolves to the restrictive answer: an unreadable settlement version is no
 * version (self_file), an unreadable administrator version prohibits.
 */
import {
  DEFAULT_EFFECTIVE_POLICY,
  FilingPolicyContentSchema,
  type ChannelConfig,
  type EffectiveFilingPolicy,
  type FilingControlsRecord,
  type FilingPolicyRecord,
  type PolicyStatus,
} from '../v2/contract-spec';

/** Same shape as ResolvePolicyInput in ./index.ts (kept here so this module has no import cycle). */
export interface PolicyLevels {
  settlementPolicy: FilingPolicyRecord | null;
  administratorPolicy: FilingPolicyRecord | null;
  settlementControls: FilingControlsRecord | null;
  administratorControls: FilingControlsRecord | null;
  thirdPartyFeeStatus: 'unknown' | 'allowed' | 'barred';
}

function approvedOnly(policy: FilingPolicyRecord | null): FilingPolicyRecord | null {
  return policy && policy.status === 'approved' ? policy : null;
}

function normalizeStates(states: readonly string[] | null | undefined): string[] | null {
  if (!Array.isArray(states)) return null;
  return [...new Set(states.filter((s) => typeof s === 'string').map((s) => s.trim().toUpperCase()))];
}

/** null means "no restriction at that level"; two lists intersect. */
export function intersectStates(a: readonly string[] | null, b: readonly string[] | null): string[] | null {
  const left = normalizeStates(a);
  const right = normalizeStates(b);
  if (left === null) return right;
  if (right === null) return left;
  const keep = new Set(right);
  return left.filter((s) => keep.has(s));
}

function enabledChannels(channels: readonly ChannelConfig[] | null | undefined): ChannelConfig[] {
  if (!Array.isArray(channels)) return [];
  return channels.filter((c) => Boolean(c) && typeof c === 'object' && (c as { enabled?: unknown }).enabled === true);
}

export function resolvePolicyLevels(input: PolicyLevels): EffectiveFilingPolicy {
  const settlement = approvedOnly(input.settlementPolicy);
  const admin = approvedOnly(input.administratorPolicy);
  const killSettlement = input.settlementControls?.kill_switch === true;
  const killAdmin = input.administratorControls?.kill_switch === true;
  const controls = {
    kill_switch: killSettlement || killAdmin,
    kill_switch_scope: killSettlement ? ('settlement' as const) : killAdmin ? ('administrator' as const) : null,
    objection_received_at:
      input.settlementControls?.objection_received_at ?? input.administratorControls?.objection_received_at ?? null,
  };
  const feeStatus = ['unknown', 'allowed', 'barred'].includes(input.thirdPartyFeeStatus)
    ? input.thirdPartyFeeStatus
    : 'unknown';

  if (!settlement) {
    return {
      ...DEFAULT_EFFECTIVE_POLICY,
      administrator_policy_id: admin?.id ?? null,
      third_party_fee_status: feeStatus,
      ...controls,
    };
  }

  return {
    settlement_policy_id: settlement.id,
    administrator_policy_id: admin?.id ?? null,
    agent_filing: admin?.agent_filing === 'prohibited' ? 'prohibited' : settlement.agent_filing,
    channels: enabledChannels(settlement.channels),
    agent_certification_allowed: settlement.agent_certification_allowed === true,
    allowed_states: intersectStates(settlement.allowed_states, admin?.allowed_states ?? null),
    health_sensitive: settlement.health_sensitive === true || admin?.health_sensitive === true,
    health_consent_text: settlement.health_consent_text ?? null,
    identity_check_required: settlement.identity_check_required === true || admin?.identity_check_required === true,
    third_party_fee_status: feeStatus,
    ...controls,
  };
}

const POLICY_CONTENT_COLUMNS = [
  'agent_filing',
  'channels',
  'agent_certification_allowed',
  'allowed_states',
  'health_sensitive',
  'health_consent_text',
  'identity_check_required',
  'sources_reviewed',
  'notes',
] as const;

/** Every filing_policies column the server reads. */
export const POLICY_SELECT =
  'id, lawsuit_id, administrator_id, version, status, agent_filing, channels, agent_certification_allowed, allowed_states, health_sensitive, health_consent_text, identity_check_required, sources_reviewed, notes, created_by, created_at, updated_by, updated_at, approved_by, approved_at, approval_notes, documents_reviewed, rejected_by, rejected_at, rejection_notes';

/** The content columns of a filing_policies row, ready for FilingPolicyContentSchema. */
export function policyContentOf(row: Record<string, unknown>): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const key of POLICY_CONTENT_COLUMNS) {
    if (row[key] !== undefined) content[key] = row[key];
  }
  return content;
}

/**
 * A filing_policies row as a record. `level` decides what an unreadable row
 * means: a settlement version that does not parse is no version (null, so
 * self_file); an administrator version that does not parse prohibits.
 */
export function policyRecordFromRow(
  row: Record<string, unknown> | null | undefined,
  level: 'settlement' | 'administrator',
): FilingPolicyRecord | null {
  if (!row || typeof row.id !== 'string') return null;
  const meta = {
    id: row.id,
    lawsuit_id: typeof row.lawsuit_id === 'string' ? row.lawsuit_id : null,
    administrator_id: typeof row.administrator_id === 'string' ? row.administrator_id : null,
    version: typeof row.version === 'number' ? row.version : 0,
    status: String(row.status ?? 'draft') as PolicyStatus,
    approved_by: typeof row.approved_by === 'string' ? row.approved_by : null,
    approved_at: typeof row.approved_at === 'string' ? row.approved_at : null,
  };
  const parsed = FilingPolicyContentSchema.safeParse(policyContentOf(row));
  if (parsed.success) return { ...parsed.data, ...meta };
  if (level === 'settlement') return null;
  return { ...FilingPolicyContentSchema.parse({}), agent_filing: 'prohibited', ...meta };
}

/** A filing_controls row as a record (absent fields are "off"). */
export function controlsRecordFromRow(row: Record<string, unknown> | null | undefined): FilingControlsRecord | null {
  if (!row) return null;
  return {
    lawsuit_id: typeof row.lawsuit_id === 'string' ? row.lawsuit_id : null,
    administrator_id: typeof row.administrator_id === 'string' ? row.administrator_id : null,
    kill_switch: row.kill_switch === true,
    kill_switch_reason: typeof row.kill_switch_reason === 'string' ? row.kill_switch_reason : null,
    objection_received_at: typeof row.objection_received_at === 'string' ? row.objection_received_at : null,
  };
}
