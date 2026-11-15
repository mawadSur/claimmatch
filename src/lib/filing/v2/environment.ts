/**
 * What the member API needs to know about settlements before it can pick a
 * lane: the settlement row (with its official guide's facts), the approved
 * filing spec, the policy in force (resolveEffectivePolicy over the approved
 * settlement and administrator versions and both kill switches), desk load
 * and whether email can be sent. Read with the service role, in one batch for
 * any number of settlements. Any read error fails the whole batch: callers
 * fall back to the self-file path, and writes answer 503. Server only.
 */
import { claimContext, SETTLEMENT_COLUMNS, serviceRoleConfigured } from '@/lib/claims-server';
import type { SettlementContext } from '@/lib/claims';
import { isVerifiedSender } from '@/lib/closing-soon-email';
import { classifyMatch } from '@/lib/matching';
import { applySettlementGuideFacts } from '@/lib/settlement-guides';
import { createServiceClient } from '@/lib/supabase/server';
import type { Lawsuit } from '@/lib/types';
import { calendarDateInZone, DEADLINE_TIME_ZONE } from '@/lib/utils';
import { resolveEffectivePolicy } from '../channels/index';
import { OPEN_JOB_STATUSES } from './contract';
import {
  DEFAULT_EFFECTIVE_POLICY,
  type EffectiveFilingPolicy,
  type FilingControlsRecord,
  type FilingPolicyRecord,
  type FilingSpecContent,
} from './contract-spec';
import { logFilingError } from './http';
import {
  CONTROLS_COLUMNS,
  POLICY_COLUMNS,
  SPEC_COLUMNS,
  toControlsRecord,
  toPolicyRecord,
  toSpecRecord,
  type SpecRecord,
} from './records';

export const FILING_SETTLEMENT_COLUMNS = `${SETTLEMENT_COLUMNS}, administrator_id, third_party_fee_status, tags`;

export interface FilingSettlement {
  id: string;
  slug: string;
  title: string;
  status: string;
  review_status: string;
  /** The official guide's deadline when it has one (claims-server rule). */
  deadline: string | null;
  claim_url: string | null;
  administrator_id: string | null;
  third_party_fee_status: 'unknown' | 'allowed' | 'barred';
  eligibility: Lawsuit['eligibility'] | null;
  tags: Lawsuit['tags'] | null;
}

export interface SettlementEnv {
  settlement: FilingSettlement;
  context: SettlementContext;
  approvedSpec: SpecRecord | null;
  policy: EffectiveFilingPolicy;
  /**
   * A strong match (structured who-qualifies rules), the only kind that may
   * show "Lawsuit AI files this claim for you" (design section 5). State-only
   * and unstructured ("possible") settlements stay on the self-file lane.
   */
  strongMatch: boolean;
}

export interface LaneEnv {
  /** Open filing_desk jobs; null when unknown (no capacity). */
  deskOpenJobs: number | null;
  emailConfigured: boolean;
}

export type EnvBatch = { ok: true; envs: Map<string, SettlementEnv>; lane: LaneEnv } | { ok: false };

function toSettlement(row: Record<string, unknown>): FilingSettlement {
  const guided = applySettlementGuideFacts({
    slug: String(row.slug ?? ''),
    deadline: typeof row.deadline === 'string' ? row.deadline : null,
    claim_url: typeof row.claim_url === 'string' ? row.claim_url : null,
    eligibility_text: typeof row.eligibility_text === 'string' ? row.eligibility_text : null,
    proof_required: typeof row.proof_required === 'boolean' ? row.proof_required : null,
    eligibility: (row.eligibility as object | null) ?? null,
  });
  const fee = row.third_party_fee_status;
  return {
    id: String(row.id ?? ''),
    slug: guided.slug,
    title: typeof row.title === 'string' ? row.title : 'Settlement',
    status: String(row.status ?? ''),
    review_status: String(row.review_status ?? ''),
    deadline: guided.deadline ? guided.deadline.slice(0, 10) : null,
    claim_url: guided.claim_url,
    administrator_id: typeof row.administrator_id === 'string' ? row.administrator_id : null,
    third_party_fee_status: fee === 'allowed' || fee === 'barred' ? fee : 'unknown',
    eligibility: (guided.eligibility as Lawsuit['eligibility'] | null) ?? null,
    tags: (row.tags as Lawsuit['tags']) ?? null,
  };
}

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim()) && isVerifiedSender(env.RESEND_FROM);
}

type Rows = { data: unknown; error: { code?: string } | null; count?: number | null };

function rowsOf(result: Rows): Record<string, unknown>[] {
  return Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
}

/** Approved policy per target; a target with an unreadable approved version maps to 'invalid'. */
function policiesBy(rows: Record<string, unknown>[], key: 'lawsuit_id' | 'administrator_id') {
  const out = new Map<string, FilingPolicyRecord | 'invalid'>();
  for (const row of rows) {
    const id = row[key];
    if (typeof id !== 'string') continue;
    const record = toPolicyRecord(row);
    out.set(id, out.has(id) ? 'invalid' : record);
  }
  return out;
}

function controlsBy(rows: Record<string, unknown>[], key: 'lawsuit_id' | 'administrator_id') {
  const out = new Map<string, FilingControlsRecord>();
  for (const row of rows) if (typeof row[key] === 'string') out.set(row[key] as string, toControlsRecord(row));
  return out;
}

function effectivePolicy(args: {
  settlement: FilingSettlement;
  settlementPolicies: Map<string, FilingPolicyRecord | 'invalid'>;
  adminPolicies: Map<string, FilingPolicyRecord | 'invalid'>;
  settlementControls: Map<string, FilingControlsRecord>;
  adminControls: Map<string, FilingControlsRecord>;
}): EffectiveFilingPolicy {
  const { settlement } = args;
  const adminId = settlement.administrator_id;
  const own = args.settlementPolicies.get(settlement.id) ?? null;
  const admin = adminId ? args.adminPolicies.get(adminId) ?? null : null;
  const controls = args.settlementControls.get(settlement.id) ?? null;
  const adminControls = adminId ? args.adminControls.get(adminId) ?? null : null;
  // Any doubt is self_file: an approved version that does not parse could hide a prohibition.
  const invalid = own === 'invalid' || admin === 'invalid';
  try {
    return resolveEffectivePolicy({
      settlementPolicy: invalid ? null : own,
      administratorPolicy: invalid ? null : admin,
      settlementControls: controls,
      administratorControls: adminControls,
      thirdPartyFeeStatus: settlement.third_party_fee_status,
    });
  } catch (error) {
    logFilingError('resolveEffectivePolicy failed', { code: error instanceof Error ? error.name : null });
    return { ...DEFAULT_EFFECTIVE_POLICY, third_party_fee_status: settlement.third_party_fee_status };
  }
}

/** Loads every settlement in `ids` (missing ones are left out). */
export async function loadSettlementEnvs(ids: string[], now: Date): Promise<EnvBatch> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: true, envs: new Map(), lane: { deskOpenJobs: null, emailConfigured: emailConfigured() } };
  if (!serviceRoleConfigured()) return { ok: false };
  try {
    const db = createServiceClient();
    const lawsuits = (await db.from('lawsuits').select(FILING_SETTLEMENT_COLUMNS).in('id', unique)) as Rows;
    if (lawsuits.error) {
      logFilingError('settlement read failed', lawsuits.error);
      return { ok: false };
    }
    const settlements = rowsOf(lawsuits).map(toSettlement);
    const adminIds = [...new Set(settlements.map((s) => s.administrator_id).filter((v): v is string => !!v))];
    const reads: Promise<Rows>[] = [
      db.from('filing_specs').select(SPEC_COLUMNS).in('lawsuit_id', unique).eq('status', 'approved') as unknown as Promise<Rows>,
      db.from('filing_policies').select(POLICY_COLUMNS).in('lawsuit_id', unique).eq('status', 'approved') as unknown as Promise<Rows>,
      db.from('filing_controls').select(CONTROLS_COLUMNS).in('lawsuit_id', unique) as unknown as Promise<Rows>,
    ];
    if (adminIds.length) {
      reads.push(
        db.from('filing_policies').select(POLICY_COLUMNS).in('administrator_id', adminIds).eq('status', 'approved') as unknown as Promise<Rows>,
        db.from('filing_controls').select(CONTROLS_COLUMNS).in('administrator_id', adminIds) as unknown as Promise<Rows>,
      );
    }
    const [specs, policies, controls, adminPolicyRows, adminControlRows] = await Promise.all(reads);
    for (const result of [specs, policies, controls, adminPolicyRows, adminControlRows]) {
      if (result?.error) {
        logFilingError('filing configuration read failed', result.error);
        return { ok: false };
      }
    }
    const specBy = new Map<string, SpecRecord>();
    for (const row of rowsOf(specs)) {
      const spec = toSpecRecord(row);
      if (spec && spec.status === 'approved') specBy.set(spec.lawsuit_id, spec);
    }
    const maps = {
      settlementPolicies: policiesBy(rowsOf(policies), 'lawsuit_id'),
      adminPolicies: policiesBy(adminPolicyRows ? rowsOf(adminPolicyRows) : [], 'administrator_id'),
      settlementControls: controlsBy(rowsOf(controls), 'lawsuit_id'),
      adminControls: controlsBy(adminControlRows ? rowsOf(adminControlRows) : [], 'administrator_id'),
    };
    const envs = new Map<string, SettlementEnv>();
    for (const settlement of settlements) {
      const policy = effectivePolicy({ settlement, ...maps });
      envs.set(settlement.id, {
        settlement,
        context: claimContext(settlement, now),
        approvedSpec: specBy.get(settlement.id) ?? null,
        policy,
        strongMatch: classifyMatch({ eligibility: settlement.eligibility ?? {}, tags: settlement.tags ?? null }) === 'strong',
      });
    }
    const needsDesk = [...envs.values()].some((e) => e.policy.channels.some((c) => c.type === 'filing_desk' && c.enabled));
    let deskOpenJobs: number | null = null;
    if (needsDesk) {
      const desk = (await db
        .from('claim_filing_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'filing_desk')
        .in('status', [...OPEN_JOB_STATUSES])) as Rows;
      deskOpenJobs = desk.error || typeof desk.count !== 'number' ? null : desk.count;
    }
    return { ok: true, envs, lane: { deskOpenJobs, emailConfigured: emailConfigured() } };
  } catch (error) {
    logFilingError('settlement environment failed', { code: error instanceof Error ? error.name : null });
    return { ok: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Deadlines (design section 4): the earlier of the settlement's and the       */
/* spec's, counted in the spec's time zone (America/New_York without one).     */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function deadlineZone(spec: FilingSpecContent | null): string {
  const zone = spec?.deadline?.time_zone;
  if (!zone) return DEADLINE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEADLINE_TIME_ZONE;
  }
}

export function effectiveDeadline(settlementDeadline: string | null, spec: FilingSpecContent | null): string | null {
  const dates = [settlementDeadline, spec?.deadline?.date ?? null].filter((d): d is string => !!d && ISO_DATE.test(d));
  return dates.length ? dates.sort()[0] : null;
}

/** Whole calendar days from today to the deadline in `zone`: 0 on the last day, negative after it. */
export function daysToDeadline(deadline: string | null, zone: string, now: Date): number | null {
  if (!deadline || !ISO_DATE.test(deadline)) return null;
  const today = calendarDateInZone(now, zone);
  const [y, m, d] = deadline.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

/** The settlement takes claims today: the shared open rule, and the effective deadline (in its zone) not passed. */
export function openForClaimsNow(env: SettlementEnv, spec: FilingSpecContent | null, now: Date): boolean {
  if (!env.context.openForClaims) return false;
  const deadline = effectiveDeadline(env.settlement.deadline, spec);
  const days = daysToDeadline(deadline, deadlineZone(spec), now);
  return days === null || days >= 0;
}
