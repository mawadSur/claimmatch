'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Scale } from 'lucide-react';
import { RoleListResponseSchema, SettlementFilingDetailResponseSchema } from '@/lib/filing/v2/contract-staff';
import { staffJson, staffPaths, type ApiError } from './api';
import { LaneBadge } from './Badges';
import { ControlsPanel } from './ControlsPanel';
import { formatDay } from './format';
import { AGENT_FILING_LABEL, CHANNEL_LABEL, LANE_REASON_LABEL } from './labels';
import { PolicySection } from './PolicySection';
import { SpecSection } from './SpecSection';
import type { FilingPermissions, ReviewerNames, SettlementDetail } from './types';
import { Badge, ErrorNote, Loading, Panel } from './ui';

export async function loadReviewerNames(permissions: FilingPermissions): Promise<ReviewerNames> {
  if (!permissions.canManageRoles) return {};
  const res = await staffJson(staffPaths.roles(), RoleListResponseSchema);
  if (!res.ok) return {};
  return Object.fromEntries(res.data.roles.filter((r) => r.email).map((r) => [r.user_id, r.email as string]));
}

function SummaryPanel({ detail }: { detail: SettlementDetail }) {
  const s = detail.summary;
  return (
    <Panel
      title="Lane today"
      description="What a member with no state issue would get today, and why any agent lane was passed over."
    >
      <div className="flex flex-wrap items-center gap-2">
        <LaneBadge lane={s.lane_preview} />
        <Badge tone="gray">Agent filing: {AGENT_FILING_LABEL[s.agent_filing]}</Badge>
        {s.kill_switch ? <Badge tone="red">Kill switch on</Badge> : null}
        {s.objection ? <Badge tone="gold">Objection on record</Badge> : null}
        <Badge tone="gray">{s.open_jobs} open jobs</Badge>
      </div>
      {s.lane_reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
          {s.lane_reasons.map((r) => (
            <li key={r}>{LANE_REASON_LABEL[r]}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-ink-muted">
        Channels on: {s.channels_enabled.length > 0 ? s.channels_enabled.map((c) => CHANNEL_LABEL[c]).join(', ') : 'none'}
      </p>
    </Panel>
  );
}

/**
 * /admin/filing/settlements/[id]: the law firm's parameters for one
 * settlement. Controls, the settlement and administrator policies, and the
 * filing spec. Every change is a draft until a legal reviewer approves it,
 * except the kill switch and objections, which take effect at once.
 */
export function SettlementConsole({
  lawsuitId,
  permissions,
  initialDetail = null,
  initialNames = {},
}: {
  lawsuitId: string;
  permissions: FilingPermissions;
  initialDetail?: SettlementDetail | null;
  initialNames?: ReviewerNames;
}) {
  const [detail, setDetail] = useState<SettlementDetail | null>(initialDetail);
  const [names, setNames] = useState<ReviewerNames>(initialNames);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(initialDetail === null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [res, reviewers] = await Promise.all([
      staffJson(staffPaths.settlement(lawsuitId), SettlementFilingDetailResponseSchema),
      loadReviewerNames(permissions),
    ]);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
    setNames(reviewers);
    setLoading(false);
  }, [lawsuitId, permissions]);

  useEffect(() => {
    if (initialDetail === null) void load();
  }, [initialDetail, load]);

  const s = detail?.summary;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">
          <Link href="/admin/filing" className="font-semibold text-brand-700 underline">Filing console</Link>
          <span aria-hidden> / </span>
          Settlement
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="badge-brand gap-1.5">
              <Scale className="h-3.5 w-3.5" aria-hidden /> Law-firm parameters
            </span>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">{s?.title ?? 'Settlement'}</h2>
            {s ? (
              <p className="mt-1 text-sm text-ink-muted">
                Deadline {formatDay(s.deadline)} · {s.administrator ? `Administrator: ${s.administrator.name}` : 'No administrator on record'}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn-ghost px-3 py-2 text-sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </button>
        </div>
      </div>

      <ErrorNote error={error} />
      {loading && !detail ? <Loading label="Loading the settlement…" /> : null}

      {detail && s ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <SummaryPanel detail={detail} />
            <ControlsPanel permissions={permissions} summary={s} controls={detail.controls} onChanged={() => void load()} />
          </div>
          <PolicySection
            permissions={permissions}
            target={{ lawsuit_id: s.lawsuit_id }}
            title="Settlement filing policy"
            administratorLevel={false}
            policies={detail.policies}
            names={names}
            onChanged={() => void load()}
          />
          {s.administrator ? (
            <PolicySection
              permissions={permissions}
              target={{ administrator_id: s.administrator.id }}
              title={`Administrator policy: ${s.administrator.name}`}
              administratorLevel
              policies={detail.administrator_policies}
              names={names}
              onChanged={() => void load()}
            />
          ) : null}
          <SpecSection
            permissions={permissions}
            lawsuitId={s.lawsuit_id}
            deadline={s.deadline}
            specs={detail.specs}
            names={names}
            onChanged={() => void load()}
          />
        </>
      ) : null}
    </div>
  );
}
