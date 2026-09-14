'use client';

import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';

export function MatchViewTracker({
  lawsuitId,
  lawsuitTitle,
  lawsuitSlug,
}: {
  lawsuitId: string;
  lawsuitTitle: string;
  lawsuitSlug: string;
}) {
  const posthog = usePostHog();
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current && posthog) {
      posthog.capture('match_viewed', {
        lawsuit_id: lawsuitId,
        lawsuit_title: lawsuitTitle,
        lawsuit_slug: lawsuitSlug,
      });
      tracked.current = true;
    }
  }, [posthog, lawsuitId, lawsuitTitle, lawsuitSlug]);

  return null;
}
