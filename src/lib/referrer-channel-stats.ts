import {
  classifyTrafficChannel,
  isTrafficChannel,
  TRAFFIC_CHANNEL_LABELS,
  TRAFFIC_CHANNELS,
  type TrafficChannel,
} from '@/lib/analytics/referrer-channel';
import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';

export const UNKNOWN_CHANNEL = 'unknown';

export interface ChannelStat {
  channel: TrafficChannel | typeof UNKNOWN_CHANNEL;
  label: string;
  signups: number;
  onboarded: number;
}

export interface ProfileChannelRow {
  first_traffic_channel?: string | null;
  first_utm_source?: string | null;
  onboarded?: boolean | null;
}

const UNKNOWN_LABEL = 'Direct / unknown';

function resolveChannel(row: ProfileChannelRow): TrafficChannel | typeof UNKNOWN_CHANNEL {
  if (isTrafficChannel(row.first_traffic_channel)) return row.first_traffic_channel;
  const classified = classifyTrafficChannel({ utmSource: row.first_utm_source ?? null });
  return classified ?? UNKNOWN_CHANNEL;
}

function emptyStats(): Map<string, ChannelStat> {
  const map = new Map<string, ChannelStat>();
  for (const channel of TRAFFIC_CHANNELS) {
    map.set(channel, {
      channel,
      label: TRAFFIC_CHANNEL_LABELS[channel],
      signups: 0,
      onboarded: 0,
    });
  }
  map.set(UNKNOWN_CHANNEL, {
    channel: UNKNOWN_CHANNEL,
    label: UNKNOWN_LABEL,
    signups: 0,
    onboarded: 0,
  });
  return map;
}

/** Aggregate signups / onboarded profiles by closed-set channel. No PII. */
export function tallyChannelRows(rows: readonly ProfileChannelRow[]): ChannelStat[] {
  const map = emptyStats();
  for (const row of rows) {
    const channel = resolveChannel(row);
    const current = map.get(channel);
    if (!current) continue;
    current.signups += 1;
    if (row.onboarded) current.onboarded += 1;
  }
  return [...map.values()].filter((row) => row.signups > 0 || row.channel !== UNKNOWN_CHANNEL);
}

export async function loadReferrerChannelStats(): Promise<ChannelStat[]> {
  if (!flags.aiReferrerAttribution()) return [];
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('profiles')
    .select('first_traffic_channel, first_utm_source, onboarded');
  if (error) {
    console.error('[referrer-channel] load failed', { code: error.code });
    return [];
  }
  return tallyChannelRows((data ?? []) as ProfileChannelRow[]);
}
