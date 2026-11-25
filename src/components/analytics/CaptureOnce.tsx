'use client';

import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';
import { withFunnelAttribution } from '@/lib/funnel';
import { isViewEvent, viewEventKey } from '@/lib/analytics/view-capture';

declare global {
  interface Window {
    __cmViewSent?: Record<string, 1>;
  }
}

function markSent(key: string): boolean {
  if (typeof window === 'undefined') return false;
  window.__cmViewSent = window.__cmViewSent || {};
  if (window.__cmViewSent[key]) return true;
  window.__cmViewSent[key] = 1;
  return false;
}

function beaconView(
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  try {
    const body = JSON.stringify({
      event,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      slug: typeof properties?.slug === 'string' ? properties.slug : undefined,
      lawsuit_id: typeof properties?.lawsuit_id === 'string' ? properties.lawsuit_id : undefined,
      properties,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/view', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/analytics/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

/** Fire a PostHog event once per mount when the client is ready. */
export function CaptureOnce({
  event,
  properties,
}: {
  event: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}) {
  const posthog = usePostHog();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const slug = typeof properties?.slug === 'string' ? properties.slug : '';
    const key = viewEventKey(event, path, slug);

    if (isViewEvent(event) && markSent(key)) {
      sent.current = true;
      return;
    }

    const send = () => {
      if (sent.current) return;
      sent.current = true;
      if (isViewEvent(event)) {
        markSent(key);
        if (posthog && (posthog as { __loaded?: boolean }).__loaded) {
          posthog.capture(event, withFunnelAttribution(properties));
          return;
        }
        beaconView(event, properties);
        return;
      }
      if (!posthog) {
        sent.current = false;
        return;
      }
      posthog.capture(event, withFunnelAttribution(properties));
    };

    if (isViewEvent(event)) {
      send();
      return;
    }

    if (posthog && (posthog as { __loaded?: boolean }).__loaded) {
      send();
      return;
    }

    const started = Date.now();
    const timer = window.setInterval(() => {
      if ((posthog as { __loaded?: boolean } | undefined)?.__loaded || Date.now() - started > 4000) {
        window.clearInterval(timer);
        send();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [posthog, event, properties]);

  return null;
}
