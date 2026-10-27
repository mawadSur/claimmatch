'use client';

import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';

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
    if (sent.current || !posthog) return;
    sent.current = true;
    posthog.capture(event, properties);
  }, [posthog, event, properties]);

  return null;
}
