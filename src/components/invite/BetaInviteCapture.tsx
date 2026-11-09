'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import {
  ANALYTICS_EVENTS,
  betaCodeVisitProperties,
} from '@/lib/analytics/events';
import {
  firstTouch,
  parseAttribution,
  readBrowserCookies,
  writeBrowserCookies,
  emptyAttribution,
} from '@/lib/attribution';
import { withFunnelAttribution } from '@/lib/funnel';
import { inviteRefFromSearch } from '@/lib/soft-invite';
import {
  BETA_INVITE_UTM_MEDIUM,
  BETA_INVITE_UTM_SOURCE,
} from '@/lib/beta-invite-utm';

const CAPTURE_KEY = 'cm_beta_code_visit';

function alreadyCaptured(): boolean {
  try {
    return sessionStorage.getItem(CAPTURE_KEY) === '1';
  } catch {
    return false;
  }
}

function markCaptured(): void {
  try {
    sessionStorage.setItem(CAPTURE_KEY, '1');
  } catch {
    /* private mode */
  }
}

/**
 * Persist `/invite?code=` as first-touch ref, log a direct invite visit, and
 * fire beta_code_visit (booleans only). Rendered only when
 * BETA_INVITE_CODES_ENABLED. Deduped per tab so /r/CODE → /invite → /signup
 * does not triple-count.
 */
export function BetaInviteCapture() {
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const code = inviteRefFromSearch(searchParams, true);
    const attr = parseAttribution(searchParams);
    const isBetaUtm =
      attr.utm_source === BETA_INVITE_UTM_SOURCE && attr.utm_medium === BETA_INVITE_UTM_MEDIUM;
    const hasCode = Boolean(code);
    if (!hasCode && !isBetaUtm) return;
    sent.current = true;

    if (code) {
      const incoming = { ...emptyAttribution(), ref: code };
      writeBrowserCookies(firstTouch(readBrowserCookies(), incoming));
      const fromQuery = searchParams.get('code');
      // Direct /invite?code= (not the /r hop, which already logged the click).
      if (fromQuery) {
        void fetch('/api/beta-invite/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        }).catch(() => {
          /* best-effort click count */
        });
      }
    }

    if (!alreadyCaptured()) {
      markCaptured();
      posthog?.capture(
        ANALYTICS_EVENTS.beta_code_visit,
        withFunnelAttribution(betaCodeVisitProperties({ hasCode })),
      );
    }
  }, [searchParams, posthog]);

  return null;
}
