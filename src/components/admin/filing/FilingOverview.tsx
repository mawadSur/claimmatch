'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, Clock, FileSpreadsheet, Inbox, RefreshCw, Send } from 'lucide-react';
import { AGENT_CHANNELS, JOB_STATUSES, type JobStatus } from '@/lib/filing/v2/contract';
import { StatCard } from '@/components/admin/StatCard';
import { fetchJobs, type ApiError, type Fetcher } from './api';
import { ChannelBadge, JobStatusBadge, SlaBadge } from './Badges';
import { formatDateTime, formatDay } from './format';
import { CHANNEL_LABEL, JOB_STATUS_LABEL } from './labels';
import { SettlementsTable } from './SettlementsTable';
import { countJobs, isOpenJob, slaWarnings, URGENT_DEADLINE_DAYS } from './sla';
import type { FilingPermissions, JobSummary } from './types';
import { ErrorNote, Loading, Panel } from './ui';

export interface OverviewJobs {
  jobs: JobSummary[];
  /** Statuses with more jobs than were loaded (their counts show "N+"). */
  capped: JobStatus[];
}

/** Open statuses load up to 1,000 jobs each; closed ones one page (100). */
export async function loadOverviewJobs(fetcher?: Fetcher): Promise<{ ok: true; data: OverviewJobs } | { ok: false; error: ApiError }> {
  const results = await Promise.all(
    JOB_STATUSES.map(async (status) => ({ status, res: await fetchJobs({ status }, isOpenJob(status) ? 10 : 1, fetcher) })),
  );
  const jobs: JobSummary[] = [];
  const capped: JobStatus[] = [];
  for (const { status, res } of results) {
    if (!res.ok) return res;
    jobs.push(...res.items);
    if (res.capped) capped.push(status);
  }
  return { ok: true, data: { jobs, capped } };
}

const ROLE_LABEL = { legal_reviewer: 'Legal reviewer', filing_agent: 'Filing agent' } as const;

export function accessSummary(permissions: FilingPermissions): string {
  const parts = [...(permissions.isAdmin ? ['Admin'] : []), ...permissions.roles.map((r) => ROLE_LABEL[r])];
  return parts.join(' · ');
}

export function FilingOverview({
  permissions,
  initialJobs = null,
  initialNow = null,
}: {
  permissions: FilingPermissions;
  /** Server or test data; the page loads it in the browser otherwise. */
  initialJobs?: OverviewJobs | null;
  initialNow?: string | null;
}) {
  const [data, setData] = useState<OverviewJobs | null>(initialJobs);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(initialJobs === null);
  const [now, setNow] = useState<Date>(() => (initialNow ? new Date(initialNow) : new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await loadOverviewJobs();
    if (res.ok) setData(res.data);
    else setError(res.error);
    setNow(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialJobs === null) void load();
  }, [initialJobs, load]);

  const counts = useMemo(() => (data ? countJobs(data.jobs) : null), [data]);
  const warnings = useMemo(() => (data ? slaWarnings(data.jobs, now) : []), [data, now]);
  const capped = new Set(data?.capped ?? []);
  const shown = (status: JobStatus, n: number) => `${n}${capped.has(status) ? '+' : ''}`;
  const openTotal = counts
    ? counts.byStatus.queued + counts.byStatus.in_progress + counts.byStatus.exported + counts.byStatus.needs_attention
    : null;
  const pastSla = warnings.filter((w) => w.sla.hoursToDue !== null && w.sla.hoursToDue < 0).length;
  const urgent = warnings.filter((w) => w.sla.level === 'urgent').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge-brand gap-1.5">
            <Send className="h-3.5 w-3.5" aria-hidden /> One-click filing
          </span>
          <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Filing console</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            Claims members signed for filing through a channel the law firm approved, and the settings for each
            settlement. Lists on this page hold no personal data. Your access: {accessSummary(permissions)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/filing/desk" className="btn-primary px-4 py-2 text-sm">
            <ClipboardList className="h-4 w-4" aria-hidden /> Open the filing desk
          </Link>
          <Link href="/admin/filing/bulk" className="btn-secondary px-4 py-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> Bulk exports
          </Link>
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost px-3 py-2 text-sm">
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </button>
        </div>
      </header>

      <ErrorNote error={error} />
      {loading && !data ? <Loading label="Loading jobs…" /> : null}

      {counts ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open jobs" value={openTotal ?? '—'} sub="Queued, in progress, exported or needing attention" icon={<Inbox className="h-4 w-4" />} />
          <StatCard label="Needs attention" value={shown('needs_attention', counts.byStatus.needs_attention)} sub="A person must check these; never retried" icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Past SLA" value={pastSla} sub="Open jobs past their due time" icon={<Clock className="h-4 w-4" />} />
          <StatCard label={`Deadline in ${URGENT_DEADLINE_DAYS} days or less`} value={urgent} sub="Open jobs to finish first" icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
      ) : null}

      {data ? (
        <Panel
          title="SLA warnings"
          description="Open jobs past their due time, due within a day, needing attention, or close to the settlement deadline. Most pressing first."
        >
          {warnings.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing needs a look right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Settlement</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">SLA</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Deadline</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {warnings.map(({ job }) => (
                    <tr key={job.id}>
                      <td className="px-3 py-2 font-medium text-ink">{job.settlement_title}</td>
                      <td className="px-3 py-2"><ChannelBadge channel={job.channel} /></td>
                      <td className="px-3 py-2"><JobStatusBadge status={job.status} /></td>
                      <td className="px-3 py-2"><SlaBadge job={job} now={now} /></td>
                      <td className="px-3 py-2 text-ink-muted">{formatDateTime(job.due_by)}</td>
                      <td className="px-3 py-2 text-ink-muted">{formatDay(job.deadline)}</td>
                      <td className="px-3 py-2 text-right">
                        {permissions.canViewMemberData && job.channel === 'filing_desk' ? (
                          <Link href={`/admin/filing/desk?job=${job.id}`} className="text-link text-xs">Open</Link>
                        ) : permissions.canViewMemberData && job.channel === 'administrator_bulk' ? (
                          <Link href={`/admin/filing/bulk?lawsuit=${job.lawsuit_id}`} className="text-link text-xs">Open</Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {counts ? (
        <Panel
          title="Jobs by status and channel"
          description={
            data && data.capped.length > 0
              ? 'Counts with + have more jobs than this page loads.'
              : 'Every filing job, by where it goes and where it stands.'
          }
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  {JOB_STATUSES.map((s) => (
                    <th key={s} className="px-3 py-2 text-right">{JOB_STATUS_LABEL[s]}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {AGENT_CHANNELS.map((channel) => (
                  <tr key={channel}>
                    <td className="px-3 py-2 font-medium text-ink">{CHANNEL_LABEL[channel]}</td>
                    {JOB_STATUSES.map((s) => (
                      <td key={s} className="px-3 py-2 text-right">{counts.byChannel[channel][s]}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">{counts.byChannel[channel].total}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2">All channels</td>
                  {JOB_STATUSES.map((s) => (
                    <td key={s} className="px-3 py-2 text-right">{shown(s, counts.byStatus[s])}</td>
                  ))}
                  <td className="px-3 py-2 text-right">{`${counts.total}${capped.size > 0 ? '+' : ''}`}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <SettlementsTable />
    </div>
  );
}
