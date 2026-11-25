/**
 * Reliable once-per-view capture for landing_viewed and settlement_viewed.
 *
 * Those events used to fire only from a client useEffect after PostHog init.
 * Child effects run before the provider's init effect, so capture() often ran
 * on an uninitialized client and never flushed — while $pageview still showed
 * up after init (or in Vercel Analytics). This module is the first-party
 * beacon path that does not wait on hydration.
 */

import { ANALYTICS_EVENTS } from './events';
import { detectTrafficKind, type TrafficKind } from './traffic';

export const VIEW_EVENTS = [ANALYTICS_EVENTS.landing_viewed, ANALYTICS_EVENTS.settlement_viewed] as const;
export type ViewEventName = (typeof VIEW_EVENTS)[number];

export function isViewEvent(value: unknown): value is ViewEventName {
  return typeof value === 'string' && (VIEW_EVENTS as readonly string[]).includes(value);
}

export function viewEventKey(event: string, path: string, slug?: string | null): string {
  return `${event}:${path}:${slug ?? ''}`;
}

/** Distinct id from the PostHog cookie when present; otherwise a stable anon id. */
export function distinctIdFromCookieHeader(
  cookieHeader: string | null | undefined,
  apiKey: string | null | undefined,
): string | null {
  if (!cookieHeader || !apiKey) return null;
  const name = `ph_${apiKey}_posthog=`;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(name)) continue;
    const raw = decodeURIComponent(trimmed.slice(name.length));
    try {
      const parsed = JSON.parse(raw) as { distinct_id?: unknown };
      if (typeof parsed.distinct_id === 'string' && parsed.distinct_id.trim()) {
        return parsed.distinct_id.trim();
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function shouldRecordView(input: {
  event: unknown;
  userAgent?: string | null;
  traffic?: TrafficKind | null;
}): { ok: true; event: ViewEventName } | { ok: false; reason: string } {
  if (!isViewEvent(input.event)) return { ok: false, reason: 'unknown_event' };
  const kind =
    input.traffic ??
    detectTrafficKind({ userAgent: input.userAgent });
  if (kind === 'bot' || kind === 'test') return { ok: false, reason: kind };
  return { ok: true, event: input.event };
}

export function viewProperties(input: {
  path?: string | null;
  slug?: string | null;
  lawsuitId?: string | null;
}): Record<string, string> {
  const props: Record<string, string> = {};
  if (input.path) props.path = input.path;
  if (input.slug) props.slug = input.slug;
  if (input.lawsuitId) props.lawsuit_id = input.lawsuitId;
  return props;
}
