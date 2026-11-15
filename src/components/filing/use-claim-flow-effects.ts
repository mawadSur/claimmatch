'use client';

import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';
import type { ClaimView } from '@/lib/claims';
import type { ClaimFlowSettlement } from '@/lib/claim-screen';
import { buildClaimTimeline } from '@/lib/claim-timeline';
import { ANALYTICS_EVENTS, claimTimelineViewedProperties } from '@/lib/analytics/events';

/**
 * Focus management for the claim page (moved out of ClaimFlow unchanged):
 * when a report succeeds the form is replaced, so focus moves to "Your
 * claim"; when a notice is answered without a report ("I haven't filed yet",
 * or "Got it" on a fictional settlement) its buttons disappear, so focus moves
 * to the confirmation and keyboard and screen-reader users aren't left at the
 * top of the page.
 */
export function useClaimFlowFocus({ reported, showNotice }: { reported: boolean; showNotice: boolean }) {
  const yourClaimHeading = useRef<HTMLHeadingElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const wasReported = useRef(reported);
  useEffect(() => {
    if (reported && !wasReported.current) yourClaimHeading.current?.focus();
    wasReported.current = reported;
  }, [reported]);

  const hadNotice = useRef(showNotice);
  useEffect(() => {
    if (hadNotice.current && !showNotice && !reported) announcementRef.current?.focus();
    hadNotice.current = showNotice;
  }, [showNotice, reported]);

  return { yourClaimHeading, announcementRef };
}

/**
 * The after-you-file timeline (CLAIM_TIMELINE_ENABLED), and its
 * claim_timeline_viewed event once per page (moved out of ClaimFlow unchanged).
 */
export function useAfterFileTimeline(settlement: ClaimFlowSettlement, claim: ClaimView | null) {
  const posthog = usePostHog();
  const timeline =
    settlement.claimTimelineEnabled && claim
      ? buildClaimTimeline({
          status: claim.status,
          confirmation_number: claim.confirmation_number,
          user_filed_on: claim.user_filed_on,
          reported_filed_at: claim.reported_filed_at,
          final_approval_hearing_at: settlement.finalApprovalHearingAt ?? null,
          payment_timing_text: settlement.paymentTimingText ?? null,
        })
      : null;
  const timelineViewed = useRef(false);
  useEffect(() => {
    if (timelineViewed.current || !posthog || !timeline) return;
    timelineViewed.current = true;
    posthog.capture(ANALYTICS_EVENTS.claim_timeline_viewed, claimTimelineViewedProperties({ source: 'claim' }));
  }, [posthog, timeline]);
  return timeline;
}
