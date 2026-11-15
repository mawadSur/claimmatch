/**
 * Formatting for the filing console. Times show in US Eastern (the default
 * deadline zone) so every staff member reads the same clock.
 */
import { formatDeadline } from '@/lib/utils';
import type { ReviewerNames } from './types';

const ZONE = 'America/New_York';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const text = date.toLocaleString('en-US', {
    timeZone: ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${text} ET`;
}

/** A bare YYYY-MM-DD date, e.g. "Nov 30, 2026"; "No deadline" when null. */
export function formatDay(day: string | null | undefined): string {
  return day ? formatDeadline(day) : 'No deadline';
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

export function shortHash(hash: string | null | undefined): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Who a staff user id is: their email when the viewer may list roles, else a short id. */
export function staffName(id: string | null | undefined, names: ReviewerNames): string {
  if (!id) return '—';
  return names[id] ?? `Staff ${shortId(id)}`;
}

/** An <input type="datetime-local"> value as an ISO instant (the browser's own zone). */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A link target only when it is https (official forms and reviewed documents always are). */
export function httpsUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}
