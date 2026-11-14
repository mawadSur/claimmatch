'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Hand, RefreshCw, X } from 'lucide-react';
import { DeskJobResponseSchema, DeskNextResponseSchema, type DeskPacketView } from '@/lib/filing/v2/contract-staff';
import { fetchJobs, staffJson, staffPaths, type ApiError, type Fetcher } from './api';
import { JobStatusBadge, SlaBadge } from './Badges';
import { DeskPacket, DeskRules } from './DeskPacket';
import { DeskResultForm, ResolveJobForm } from './DeskForms';
import { formatDateTime, formatDay } from './format';
import { sortQueue } from './sla';
import type { FilingPermissions, JobSummary } from './types';
import { Badge, ErrorNote, Loading, Notice, Panel } from './ui';

/** The desk's queue: its open filing_desk jobs (no personal data). */
export async function loadDeskQueue(fetcher?: Fetcher): Promise<{ ok: true; jobs: JobSummary[] } | { ok: false; error: ApiError }> {
  const statuses = ['in_progress', 'needs_attention', 'queued'] as const;
  const results = await Promise.all(statuses.map((status) => fetchJobs({ channel: 'filing_desk', status }, 5, fetcher)));
  const jobs: JobSummary[] = [];
  for (const res of results) {
    if (!res.ok) return res;
    jobs.push(...res.items);
  }
  return { ok: true, jobs };
}

export interface DeskGroups {
  mine: JobSummary[];
  attention: JobSummary[];
  queued: JobSummary[];
  others: JobSummary[];
}

/** Soonest settlement deadline first within each group. */
export function groupDeskQueue(jobs: readonly JobSummary[]): DeskGroups {
  const sorted = sortQueue(jobs);
  return {
    mine: sorted.filter((j) => j.status === 'in_progress' && j.locked_by_me),
    attention: sorted.filter((j) => j.status === 'needs_attention'),
    queued: sorted.filter((j) => j.status === 'queued'),
    others: sorted.filter((j) => j.status === 'in_progress' && !j.locked_by_me),
  };
}

function QueueTable({
  jobs,
  now,
  canOpen,
  onOpen,
  openLabel,
}: {
  jobs: readonly JobSummary[];
  now: Date;
  canOpen: boolean;
  onOpen: (id: string) => void;
  openLabel: string;
}) {
  if (jobs.length === 0) return <p className="text-sm text-ink-muted">None.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2">Settlement</th>
            <th className="px-3 py-2">Deadline</th>
            <th className="px-3 py-2">SLA</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Tries</th>
            <th className="px-3 py-2">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="px-3 py-2 font-medium text-ink">
                {job.settlement_title}
                {job.needs_attention_reason ? <p className="font-mono text-xs text-ink-muted">{job.needs_attention_reason}</p> : null}
              </td>
              <td className="px-3 py-2 text-ink-muted">{formatDay(job.deadline)}</td>
              <td className="px-3 py-2"><SlaBadge job={job} now={now} /></td>
              <td className="px-3 py-2 text-ink-muted">{formatDateTime(job.due_by)}</td>
              <td className="px-3 py-2"><JobStatusBadge status={job.status} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{job.attempt}</td>
              <td className="px-3 py-2 text-right">
                {canOpen ? (
                  <button type="button" className="text-link text-xs" onClick={() => onOpen(job.id)}>{openLabel}</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * /admin/filing/desk. Filing agents take the next due job (it is locked to
 * them for 30 minutes), file it on the official site in their own browser,
 * and record the result. Others see the queue; legal reviewers may open a job
 * to review it or resolve one that needs attention.
 */
export function DeskConsole({
  permissions,
  openJobId = null,
  initialQueue = null,
  initialJob = null,
  initialNow = null,
}: {
  permissions: FilingPermissions;
  openJobId?: string | null;
  initialQueue?: JobSummary[] | null;
  initialJob?: DeskPacketView | null;
  initialNow?: string | null;
}) {
  const [queue, setQueue] = useState<JobSummary[] | null>(initialQueue);
  const [queueError, setQueueError] = useState<ApiError | null>(null);
  const [current, setCurrent] = useState<DeskPacketView | null>(initialJob);
  const [jobError, setJobError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date>(() => (initialNow ? new Date(initialNow) : new Date()));

  const loadQueue = useCallback(async () => {
    setQueueError(null);
    const res = await loadDeskQueue();
    if (res.ok) setQueue(res.jobs);
    else setQueueError(res.error);
    setNow(new Date());
  }, []);

  const openJob = useCallback(async (id: string) => {
    setBusy(true);
    setJobError(null);
    setMessage(null);
    const res = await staffJson(staffPaths.job(id), DeskJobResponseSchema);
    setBusy(false);
    if (res.ok) setCurrent(res.data.job);
    else setJobError(res.error);
  }, []);

  useEffect(() => {
    if (initialQueue === null) void loadQueue();
  }, [initialQueue, loadQueue]);

  useEffect(() => {
    if (openJobId && initialJob === null && permissions.canViewMemberData) void openJob(openJobId);
  }, [openJobId, initialJob, permissions.canViewMemberData, openJob]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function takeNext() {
    setBusy(true);
    setJobError(null);
    setMessage(null);
    const res = await staffJson(staffPaths.deskNext(), DeskNextResponseSchema, { method: 'POST', body: {} });
    setBusy(false);
    if (!res.ok) setJobError(res.error);
    else if (!res.data.job) setMessage('Nothing is due right now.');
    else setCurrent(res.data.job);
    void loadQueue();
  }

  function finished(text: string) {
    setCurrent(null);
    setMessage(text);
    void loadQueue();
  }

  const groups = useMemo(() => groupDeskQueue(queue ?? []), [queue]);
  const job = current;
  const mayRecord = Boolean(job && job.lock.mine && job.job.status === 'in_progress' && permissions.canWorkDesk);
  const mayResolve = Boolean(job && job.job.status === 'needs_attention' && permissions.canResolveJobs);
  const lockLeftMs = job?.lock.mine && job.lock.expires_at ? Date.parse(job.lock.expires_at) - now.getTime() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">
          <Link href="/admin/filing" className="font-semibold text-brand-700 underline">Filing console</Link>
          <span aria-hidden> / </span>
          Desk
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="badge-brand gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Filing desk
            </span>
            <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Filing desk</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Signed claims for settlements where the law firm approved the desk. Soonest deadline first.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {permissions.canWorkDesk ? (
              <button type="button" className="btn-primary px-4 py-2 text-sm" disabled={busy || Boolean(mayRecord)} onClick={() => void takeNext()}>
                <Hand className="h-4 w-4" aria-hidden /> Take the next job
              </button>
            ) : null}
            <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => void loadQueue()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </button>
          </div>
        </div>
      </div>

      <DeskRules />
      {!permissions.canWorkDesk ? (
        <Notice tone="info">
          Only filing agents take jobs and record results.
          {permissions.canViewMemberData ? ' You can open a job to review it.' : ' The queue holds no personal data.'}
        </Notice>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      <ErrorNote error={jobError} />
      {busy && !job ? <Loading label="Working…" /> : null}

      {job ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-ink">Open job</h3>
            <div className="flex items-center gap-2">
              {lockLeftMs !== null && lockLeftMs < 5 * 60_000 ? (
                <Badge tone="red">{lockLeftMs > 0 ? 'Your lock ends in under 5 minutes' : 'Your lock has ended'}</Badge>
              ) : null}
              {!mayRecord ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setCurrent(null)}>
                  <X className="h-4 w-4" aria-hidden /> Close
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[3fr,2fr]">
            <DeskPacket view={job} now={now} />
            <div className="space-y-4">
              {mayRecord ? <DeskResultForm key={job.job.id} view={job} onDone={finished} /> : null}
              {mayResolve ? <ResolveJobForm key={job.job.id} jobId={job.job.id} onDone={finished} /> : null}
              {!mayRecord && !mayResolve ? (
                <Notice tone="info">You are viewing this job. Only the filing agent who took it records its result.</Notice>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ErrorNote error={queueError} />
      {queue === null && !queueError ? <Loading label="Loading the queue…" /> : null}
      {queue ? (
        <div className="space-y-6">
          {groups.mine.length > 0 ? (
            <Panel title="Your open jobs" description="Finish these first; your lock lasts 30 minutes from when you took each one.">
              <QueueTable jobs={groups.mine} now={now} canOpen={permissions.canViewMemberData} onOpen={(id) => void openJob(id)} openLabel="Continue" />
            </Panel>
          ) : null}
          <Panel title={`Needs attention (${groups.attention.length})`} description="It may have reached the administrator. Never retried; a person checks and resolves it.">
            <QueueTable jobs={groups.attention} now={now} canOpen={permissions.canViewMemberData} onOpen={(id) => void openJob(id)} openLabel="Review" />
          </Panel>
          <Panel title={`Queue (${groups.queued.length})`} description="“Take the next job” gives you the next one due.">
            <QueueTable jobs={groups.queued} now={now} canOpen={permissions.canViewMemberData} onOpen={(id) => void openJob(id)} openLabel="View" />
          </Panel>
          {groups.others.length > 0 ? (
            <Panel title={`With other agents (${groups.others.length})`}>
              <QueueTable jobs={groups.others} now={now} canOpen={false} onOpen={() => undefined} openLabel="" />
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
