/**
 * SLA and queue helpers for the filing console. Pure: the caller passes `now`.
 * The desk SLA is the job's due_by (now plus the desk's business days when
 * queued, never after the channel's cutoff); a deadline 3 days away or less
 * is urgent, as the cron's staff alert (docs/designs/one-click-filing.md, section 4).
 */
import {
  AGENT_CHANNELS,
  JOB_STATUSES,
  OPEN_JOB_STATUSES,
  type AgentChannel,
  type JobStatus,
} from '@/lib/filing/v2/contract';
import { daysUntil } from '@/lib/utils';
import type { JobSummary } from './types';

export const URGENT_DEADLINE_DAYS = 3;
export const DUE_SOON_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export type SlaLevel = 'urgent' | 'overdue' | 'attention' | 'soon' | 'ok';

export interface SlaState {
  level: SlaLevel;
  label: string;
  daysToDeadline: number | null;
  hoursToDue: number | null;
}

/** Most pressing first. */
export const SLA_ORDER: Readonly<Record<SlaLevel, number>> = { urgent: 0, overdue: 1, attention: 2, soon: 3, ok: 4 };

export function isOpenJob(status: JobStatus): boolean {
  return (OPEN_JOB_STATUSES as readonly string[]).includes(status);
}

function deadlineText(days: number): string {
  if (days < 0) return 'deadline passed';
  if (days === 0) return 'deadline today';
  if (days === 1) return 'deadline tomorrow';
  return `deadline in ${days} days`;
}

function hoursText(hours: number): string {
  const whole = Math.max(1, Math.ceil(hours));
  return whole === 1 ? 'due within the hour' : `due in ${whole} h`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The SLA badge for an open job; null for a closed one. */
export function jobSla(job: Pick<JobSummary, 'status' | 'due_by' | 'deadline'>, now: Date): SlaState | null {
  if (!isOpenJob(job.status)) return null;
  const days = daysUntil(job.deadline, now);
  const dueMs = job.due_by ? Date.parse(job.due_by) : Number.NaN;
  const hoursToDue = Number.isFinite(dueMs) ? (dueMs - now.getTime()) / HOUR_MS : null;
  const deadlineClose = days !== null && days <= URGENT_DEADLINE_DAYS;
  const overdue = hoursToDue !== null && hoursToDue < 0;
  const parts: string[] = [];
  if (job.status === 'needs_attention') parts.push('needs attention');
  if (overdue) parts.push('past SLA');
  if (deadlineClose && days !== null) parts.push(deadlineText(days));

  let level: SlaLevel;
  if (deadlineClose) level = 'urgent';
  else if (overdue) level = 'overdue';
  else if (job.status === 'needs_attention') level = 'attention';
  else if (hoursToDue !== null && hoursToDue <= DUE_SOON_HOURS) {
    level = 'soon';
    parts.push(hoursText(hoursToDue));
  } else level = 'ok';

  const label = parts.length > 0 ? capitalize(parts.join(', ')) : 'On track';
  return { level, label, daysToDeadline: days, hoursToDue };
}

/** Open jobs that need a look, most pressing first, then soonest deadline. */
export function slaWarnings(jobs: readonly JobSummary[], now: Date): Array<{ job: JobSummary; sla: SlaState }> {
  return jobs
    .map((job) => ({ job, sla: jobSla(job, now) }))
    .filter((row): row is { job: JobSummary; sla: SlaState } => row.sla !== null && row.sla.level !== 'ok')
    .sort((a, b) => SLA_ORDER[a.sla.level] - SLA_ORDER[b.sla.level] || compareQueue(a.job, b.job));
}

function compareNullableText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Soonest settlement deadline first, then soonest due_by, then oldest. No deadline goes last. */
export function compareQueue(a: JobSummary, b: JobSummary): number {
  return (
    compareNullableText(a.deadline, b.deadline) ||
    compareNullableText(a.due_by, b.due_by) ||
    compareNullableText(a.created_at, b.created_at) ||
    compareNullableText(a.id, b.id)
  );
}

export function sortQueue(jobs: readonly JobSummary[]): JobSummary[] {
  return [...jobs].sort(compareQueue);
}

export interface JobCounts {
  total: number;
  byStatus: Record<JobStatus, number>;
  byChannel: Record<AgentChannel, Record<JobStatus, number> & { total: number }>;
}

function zeroByStatus(): Record<JobStatus, number> {
  return Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
}

/** Jobs counted by status and by channel (the agent lane). Duplicate ids count once. */
export function countJobs(jobs: readonly JobSummary[]): JobCounts {
  const byChannel = Object.fromEntries(
    AGENT_CHANNELS.map((c) => [c, { ...zeroByStatus(), total: 0 }]),
  ) as JobCounts['byChannel'];
  const byStatus = zeroByStatus();
  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    byStatus[job.status] += 1;
    byChannel[job.channel][job.status] += 1;
    byChannel[job.channel].total += 1;
  }
  return { total: seen.size, byStatus, byChannel };
}
