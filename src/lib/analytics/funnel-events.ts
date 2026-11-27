/**
 * Funnel event payloads and server capture, gated by FUNNEL_EVENTS_ENABLED.
 * Unset = old behavior (no extra events). Never puts email or other PII in
 * properties. Reuses captureServerEvent (no second PostHog client).
 */
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent } from '@/lib/analytics/server';
import {
  detectTrafficKind,
  matchesQaPromo,
  TRAFFIC_PROPERTY,
  type TrafficKind,
} from '@/lib/analytics/traffic';
import { flags } from '@/lib/flags';
import { isInternalEmail } from '@/lib/internal-users';

export const FUNNEL_EVENT_NAMES = [
  ANALYTICS_EVENTS.checkout_started,
  ANALYTICS_EVENTS.trial_started,
  ANALYTICS_EVENTS.easy_submit_started,
  ANALYTICS_EVENTS.esign_completed,
  ANALYTICS_EVENTS.official_form_opened,
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export function funnelEventsEnabled(): boolean {
  return flags.funnelEvents();
}

export function serverTrafficKind(input: {
  email?: string | null;
  isInternal?: boolean;
  promoCodes?: readonly string[] | null;
}): TrafficKind {
  return detectTrafficKind({
    internal: Boolean(input.isInternal) || isInternalEmail(input.email),
    qaPromo: matchesQaPromo(input.promoCodes),
  });
}

export function stripePromoCodes(sub: {
  discounts?: unknown;
  discount?: unknown;
}): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) out.add(value.trim().toLowerCase());
  };
  const fromDiscount = (discount: unknown) => {
    if (!discount || typeof discount !== 'object') return;
    const row = discount as {
      coupon?: { id?: unknown; name?: unknown } | null;
      promotion_code?: unknown;
    };
    add(row.coupon?.id);
    add(row.coupon?.name);
    if (typeof row.promotion_code === 'string') add(row.promotion_code);
    else if (row.promotion_code && typeof row.promotion_code === 'object') {
      const promo = row.promotion_code as { id?: unknown; code?: unknown };
      add(promo.id);
      add(promo.code);
    }
  };
  fromDiscount(sub.discount);
  if (Array.isArray(sub.discounts)) {
    for (const item of sub.discounts) {
      if (typeof item === 'string') add(item);
      else fromDiscount(item);
    }
  }
  return [...out];
}

export function funnelEventProperties(input: {
  settlementSlug?: string | null;
  claimActionType?: string | null;
  trafficKind?: TrafficKind;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const props: Record<string, unknown> = {
    [TRAFFIC_PROPERTY]: input.trafficKind ?? 'product',
  };
  const slug = input.settlementSlug?.trim();
  if (slug) {
    props.settlement_slug = slug;
    props.slug = slug;
  }
  const action = input.claimActionType?.trim();
  if (action) props.claim_action_type = action;
  return { ...props, ...(input.extra ?? {}) };
}

export function shouldCaptureTrialStarted(input: {
  enabled?: boolean;
  status?: string | null;
}): boolean {
  const enabled = input.enabled ?? funnelEventsEnabled();
  return enabled && input.status === 'trialing';
}

export async function captureFunnelServerEvent(input: {
  event: FunnelEventName;
  distinctId: string;
  settlementSlug?: string | null;
  claimActionType?: string | null;
  email?: string | null;
  isInternal?: boolean;
  promoCodes?: readonly string[] | null;
  extra?: Record<string, unknown>;
}): Promise<{ captured: boolean; reason?: 'flag_off' }> {
  if (!funnelEventsEnabled()) return { captured: false, reason: 'flag_off' };
  const properties = funnelEventProperties({
    settlementSlug: input.settlementSlug,
    claimActionType: input.claimActionType,
    trafficKind: serverTrafficKind({
      email: input.email,
      isInternal: input.isInternal,
      promoCodes: input.promoCodes,
    }),
    extra: input.extra,
  });
  const captured = await captureServerEvent({
    event: input.event,
    distinctId: input.distinctId,
    properties,
  });
  return { captured };
}

export function clientFunnelEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.cmFunnel === '1';
}

export function clientDidYouFileEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.cmDidYouFile === '1';
}
