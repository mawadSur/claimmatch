'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, Suspense, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  attributionPersonProperties,
  doNotTrackEnabled,
  firstTouch,
  hasAttribution,
  parseAttribution,
  readBrowserCookies,
  writeBrowserCookies,
} from '@/lib/attribution';
import { posthogUiHost } from '@/lib/posthog-proxy';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) {
        url += '?' + search;
      }
      ph.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/**
 * Persist first-touch UTMs + ref from the URL, copy them onto the PostHog
 * person (set-once), and save them on the signed-in profile when we can.
 */
function AttributionSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();
  const posted = useRef(false);

  useEffect(() => {
    const incoming = parseAttribution(searchParams);
    const merged = firstTouch(readBrowserCookies(), incoming);
    if (!hasAttribution(merged)) return;
    writeBrowserCookies(merged);
    const props = attributionPersonProperties(merged);
    if (ph && Object.keys(props).length > 0) {
      ph.setPersonProperties({}, props);
    }
    if (posted.current) return;
    posted.current = true;
    void fetch('/api/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    }).catch(() => {
      posted.current = false;
    });
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (
      doNotTrackEnabled(
        navigator,
        typeof window !== 'undefined'
          ? (window as Window & { doNotTrack?: string | null }).doNotTrack
          : null,
      )
    ) {
      return;
    }
    posthog.init(POSTHOG_KEY, {
      api_host: '/ingest',
      ui_host: posthogUiHost(),
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
    });
  }, []);

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
        <AttributionSync />
      </Suspense>
      {children}
    </PHProvider>
  );
}
