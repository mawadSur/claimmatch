/**
 * Status badges for the filing console: SLA, job status, channel and version
 * status. Presentational only.
 */
import { Clock } from 'lucide-react';
import type { AgentChannel, JobStatus, Lane, PolicyStatus, SpecStatus } from '@/lib/filing/v2/contract';
import { CHANNEL_LABEL, JOB_STATUS_LABEL, LANE_LABEL, VERSION_STATUS_LABEL } from './labels';
import { jobSla, type SlaLevel } from './sla';
import type { JobSummary } from './types';
import { Badge, type BadgeTone } from './ui';

const SLA_TONE: Readonly<Record<SlaLevel, BadgeTone>> = {
  urgent: 'red',
  overdue: 'red',
  attention: 'gold',
  soon: 'gold',
  ok: 'gray',
};

export function SlaBadge({ job, now }: { job: Pick<JobSummary, 'status' | 'due_by' | 'deadline'>; now: Date }) {
  const sla = jobSla(job, now);
  if (!sla) return null;
  return (
    <Badge tone={SLA_TONE[sla.level]}>
      <Clock className="h-3 w-3" aria-hidden />
      {sla.label}
    </Badge>
  );
}

const JOB_TONE: Readonly<Record<JobStatus, BadgeTone>> = {
  queued: 'brand',
  in_progress: 'brand',
  exported: 'brand',
  needs_attention: 'gold',
  filed: 'green',
  rejected: 'red',
  cancelled: 'gray',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONE[status]}>{JOB_STATUS_LABEL[status]}</Badge>;
}

export function ChannelBadge({ channel }: { channel: AgentChannel }) {
  return <Badge tone="gray">{CHANNEL_LABEL[channel]}</Badge>;
}

export function LaneBadge({ lane }: { lane: Lane }) {
  return <Badge tone={lane === 'self_file' ? 'gray' : 'green'}>{LANE_LABEL[lane]}</Badge>;
}

const VERSION_TONE: Readonly<Record<PolicyStatus | SpecStatus, BadgeTone>> = {
  draft: 'gold',
  approved: 'green',
  superseded: 'gray',
  rejected: 'red',
  retired: 'gray',
};

export function VersionStatusBadge({ status }: { status: PolicyStatus | SpecStatus }) {
  return <Badge tone={VERSION_TONE[status]}>{VERSION_STATUS_LABEL[status]}</Badge>;
}
