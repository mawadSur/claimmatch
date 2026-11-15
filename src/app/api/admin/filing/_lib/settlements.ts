/**
 * The console's settlement overview (SettlementFilingSummarySchema): policy
 * and spec versions, controls, the lane a member would get today and the open
 * jobs. No member data.
 */
import {
  countOpenDeskJobs,
  emailChannelConfigured,
  laneFor,
  lawsuitFacts,
  specRowFrom,
  type SettlementFiling,
} from '@/lib/filing/channels/context';
import { effectiveDeadline } from '@/lib/filing/channels/dates';
import { resolveEffectivePolicy } from '@/lib/filing/channels/index';
import { needsDocumentsFor } from '@/lib/filing/channels/lane';
import { controlsRecordFromRow, policyRecordFromRow, POLICY_SELECT } from '@/lib/filing/channels/policy';
import type { createServiceClient } from '@/lib/supabase/server';

type Svc = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

export const LAWSUIT_LIST_SELECT = 'id, slug, title, status, review_status, deadline, claim_url, administrator_id, third_party_fee_status';

const by = <T extends Row>(rows: T[] | null | undefined, key: string) => {
  const map = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const k = row[key];
    if (typeof k !== 'string') continue;
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
};

const versionOf = (rows: Row[] | undefined, status: string): number | null => {
  const hit = (rows ?? []).find((r) => r.status === status);
  return hit ? Number(hit.version) : null;
};

/** Summaries for these settlement rows, in their order. */
export async function settlementSummaries(svc: Svc, lawsuitRows: Row[], now: Date) {
  const lawsuits = lawsuitRows.map(lawsuitFacts);
  const ids = lawsuits.map((l) => l.id);
  const adminIds = [...new Set(lawsuits.map((l) => l.administrator_id).filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return [];
  const none = Promise.resolve({ data: [] as Row[] });
  const [policies, adminPolicies, controls, adminControls, specs, jobs, admins, deskOpen] = await Promise.all([
    svc.from('filing_policies').select(POLICY_SELECT).in('lawsuit_id', ids).in('status', ['draft', 'approved']),
    adminIds.length ? svc.from('filing_policies').select(POLICY_SELECT).in('administrator_id', adminIds).eq('status', 'approved') : none,
    svc.from('filing_controls').select('*').in('lawsuit_id', ids),
    adminIds.length ? svc.from('filing_controls').select('*').in('administrator_id', adminIds) : none,
    svc.from('filing_specs').select('id, lawsuit_id, version, status, content').in('lawsuit_id', ids).in('status', ['draft', 'approved']),
    svc.from('claim_filing_jobs').select('lawsuit_id').in('lawsuit_id', ids).in('status', ['queued', 'in_progress', 'exported', 'needs_attention']),
    adminIds.length ? svc.from('administrators').select('id, slug, name').in('id', adminIds) : none,
    countOpenDeskJobs(svc),
  ]);
  const policyBy = by(policies.data as Row[], 'lawsuit_id');
  const adminPolicyBy = by(adminPolicies.data as Row[], 'administrator_id');
  const controlsBy = by(controls.data as Row[], 'lawsuit_id');
  const adminControlsBy = by(adminControls.data as Row[], 'administrator_id');
  const specBy = by(specs.data as Row[], 'lawsuit_id');
  const jobCount = new Map<string, number>();
  for (const j of (jobs.data ?? []) as Row[]) jobCount.set(String(j.lawsuit_id), (jobCount.get(String(j.lawsuit_id)) ?? 0) + 1);
  const adminOf = new Map(((admins.data ?? []) as Row[]).map((a) => [String(a.id), { id: String(a.id), slug: String(a.slug), name: String(a.name) }]));
  const emailConfigured = emailChannelConfigured();

  return lawsuits.map((lawsuit) => {
    const own = policyBy.get(lawsuit.id) ?? [];
    const approved = own.find((p) => p.status === 'approved') ?? null;
    const adminRow = lawsuit.administrator_id ? (adminPolicyBy.get(lawsuit.administrator_id) ?? [])[0] ?? null : null;
    const settlementControls = controlsRecordFromRow((controlsBy.get(lawsuit.id) ?? [])[0]);
    const administratorControls = lawsuit.administrator_id ? controlsRecordFromRow((adminControlsBy.get(lawsuit.administrator_id) ?? [])[0]) : null;
    const adminRecord = policyRecordFromRow(adminRow, 'administrator');
    const policy = resolveEffectivePolicy({
      settlementPolicy: policyRecordFromRow(approved, 'settlement'),
      administratorPolicy: adminRecord,
      settlementControls,
      administratorControls,
      thirdPartyFeeStatus: lawsuit.third_party_fee_status,
    });
    const specRows = specBy.get(lawsuit.id) ?? [];
    const approvedSpec = specRowFrom(specRows.find((s) => s.status === 'approved'));
    const settlement: SettlementFiling = { lawsuit, administrator: null, policy, approvedSpec };
    // A member in a covered state with nothing else in the way.
    const decision = laneFor(settlement, {
      now,
      spec: approvedSpec,
      memberState: policy.allowed_states?.[0] ?? null,
      benefitTier: null,
      needsDocuments: approvedSpec ? needsDocumentsFor(approvedSpec.content, null) : false,
      healthGiven: null,
      deskOpenJobs: deskOpen,
      emailConfigured,
    });
    const reasons = decision.reasons.map((r) =>
      r === 'agent_filing_prohibited' && adminRecord?.agent_filing === 'prohibited' ? ('administrator_prohibits' as const) : r,
    );
    return {
      lawsuit_id: lawsuit.id,
      slug: lawsuit.slug,
      title: lawsuit.title,
      deadline: effectiveDeadline(lawsuit.deadline, approvedSpec?.content.deadline?.date ?? null),
      administrator: lawsuit.administrator_id ? adminOf.get(lawsuit.administrator_id) ?? null : null,
      agent_filing: policy.agent_filing,
      channels_enabled: policy.channels.map((c) => c.type),
      lane_preview: decision.lane,
      lane_reasons: reasons,
      kill_switch: policy.kill_switch,
      objection: Boolean(policy.objection_received_at),
      policy: { approved_version: versionOf(own, 'approved'), draft_version: versionOf(own, 'draft') },
      spec: { approved_version: versionOf(specRows, 'approved'), draft_version: versionOf(specRows, 'draft') },
      open_jobs: jobCount.get(lawsuit.id) ?? 0,
    };
  });
}

/** Lawsuit ids a filter narrows to; null for "all". */
export async function filterIds(svc: Svc, filter: 'all' | 'agent_enabled' | 'needs_review' | 'kill_switch'): Promise<string[] | null> {
  if (filter === 'all') return null;
  if (filter === 'agent_enabled') {
    const { data } = await svc.from('filing_policies').select('lawsuit_id, channels').eq('status', 'approved').eq('agent_filing', 'allowed').not('lawsuit_id', 'is', null);
    return ((data ?? []) as Row[])
      .filter((r) => Array.isArray(r.channels) && (r.channels as Row[]).some((c) => c?.enabled === true))
      .map((r) => String(r.lawsuit_id));
  }
  if (filter === 'needs_review') {
    const [p, s] = await Promise.all([
      svc.from('filing_policies').select('lawsuit_id').eq('status', 'draft').not('lawsuit_id', 'is', null),
      svc.from('filing_specs').select('lawsuit_id').eq('status', 'draft'),
    ]);
    return [...new Set([...((p.data ?? []) as Row[]), ...((s.data ?? []) as Row[])].map((r) => String(r.lawsuit_id)))];
  }
  const [own, admin] = await Promise.all([
    svc.from('filing_controls').select('lawsuit_id').eq('kill_switch', true).not('lawsuit_id', 'is', null),
    svc.from('filing_controls').select('administrator_id').eq('kill_switch', true).not('administrator_id', 'is', null),
  ]);
  const adminIds = ((admin.data ?? []) as Row[]).map((r) => String(r.administrator_id));
  const viaAdmin = adminIds.length
    ? (((await svc.from('lawsuits').select('id').in('administrator_id', adminIds)).data ?? []) as Row[]).map((r) => String(r.id))
    : [];
  return [...new Set([...((own.data ?? []) as Row[]).map((r) => String(r.lawsuit_id)), ...viaAdmin])];
}

/** `%` and `_` are wildcards in ilike: searched literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
