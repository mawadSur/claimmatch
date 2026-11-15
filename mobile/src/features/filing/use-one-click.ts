import type { ClaimFilingView, LaneView } from '@shared/lib/filing/v2/contract';
import type { ClaimTone } from '@shared/lib/claims';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { filing as copy } from '@/copy/filing';
import type { ClaimScreenResult, FlowClaimScreen } from '@/data/claims';
import { refreshDashboardSoon } from '@/data/dashboard';
import { dataKeys } from '@/data/keys';

import { getFiling, getLanePreview, isFilingOff } from './api';
import { claimNote, claimViewFromFiling, filingStatusDisplay, isOneClickStatus, laneReasonLines } from './model';

export type OnFilingView = (view: ClaimFilingView, message: string) => void;

/** What the claim screen shows for one-click filing; null while it is off. */
export interface OneClickState {
  /** The claim is in a one-click status: the one-click flow replaces the self-file steps. */
  active: boolean;
  /** The claim's filing view; null without a claim, while loading or when it could not be read. */
  view: ClaimFilingView | null;
  /** The claim is in a one-click status and its view is still loading. */
  loading: boolean;
  /** The claim is in a one-click status but its view could not be read. */
  loadFailed: boolean;
  /** The lane this member gets today: from the view, or the preview while "Start my claim" is offered. */
  lane: LaneView | null;
  /** Offer "Start my claim" above the self-file steps. */
  offerStart: boolean;
  /** Why Lawsuit AI can't file this claim (member-safe reasons), at the top of self-file Step 2. */
  reasons: string[];
  /** A claim prepared in Lawsuit AI and now self-filed: its answers to copy. */
  handedBack: ClaimFilingView | null;
  badge: { label: string; tone: ClaimTone } | null;
  note: string;
  onView: OnFilingView;
}

const filingKey = (slug: string, claimId: string | null) => [...dataKeys.claim(slug), 'filing', claimId ?? 'none'] as const;

/**
 * The claim screen's one-click state (the web's use-one-click-claim.tsx):
 * GET /api/filing/claims/{id} for the claim, with the app's bearer token,
 * loaded again whenever the screen loads again. Every change the member makes
 * puts the server's new view here and its claim into the cached claim screen.
 * Null when the server sent no `oneClick` (ONE_CLICK_FILING_ENABLED off, or
 * an older server), so the screen is exactly what it was.
 */
export function useOneClick(data: FlowClaimScreen, announce: (message: string) => void): OneClickState | null {
  const client = useQueryClient();
  const enabled = Boolean(data.oneClick);
  const claim = data.claim;
  const claimId = claim?.id ?? null;
  const query = useQuery({
    queryKey: filingKey(data.slug, claimId),
    queryFn: async () => {
      const result = await getFiling(claimId as string);
      if (result.ok) return result.data;
      // Off on the server, or not this member's claim: the self-file steps, unchanged.
      if (isFilingOff(result)) return null;
      throw new Error(result.error);
    },
    enabled: enabled && claimId !== null,
    staleTime: 0,
    retry: false,
  });

  // The lane for "Start my claim" (its timing and last day), when there is no filing view to read it from.
  const wantsPreview = Boolean(data.oneClick?.canStart) && !(claim && isOneClickStatus(claim.status));
  const preview = useQuery({
    queryKey: [...dataKeys.claim(data.slug), 'lane-preview', data.settlement.id] as const,
    queryFn: async () => {
      const result = await getLanePreview(data.settlement.id);
      return result.ok ? result.data.lane : null;
    },
    enabled: enabled && wantsPreview,
    staleTime: 0,
    retry: false,
  });

  // The screen loaded again (focus, pull to refresh): load the filing view again too.
  const { refetch } = query;
  const loadedAt = useRef(data.now);
  useEffect(() => {
    if (loadedAt.current === data.now) return;
    loadedAt.current = data.now;
    if (enabled && claimId) void refetch();
  }, [data.now, enabled, claimId, refetch]);

  const onView = useCallback<OnFilingView>(
    (view, message) => {
      client.setQueryData(filingKey(data.slug, view.claim.id), view);
      client.setQueryData<ClaimScreenResult>(dataKeys.claim(data.slug), (current) =>
        current?.kind === 'flow' ? { ...current, claim: claimViewFromFiling(view, current.claim) } : current,
      );
      refreshDashboardSoon(client);
      if (message) announce(message);
    },
    [client, data.slug, announce],
  );

  if (!data.oneClick) return null;
  const view = claimId ? (query.data ?? null) : null;
  const active = Boolean(claim && isOneClickStatus(claim.status));
  const offerStart = Boolean(data.oneClick.canStart && !active && (!claim || claim.status === 'self_file'));
  const lane = view?.lane ?? (offerStart ? (preview.data ?? null) : null);
  return {
    active,
    view,
    loading: active && query.isPending,
    loadFailed: active && !query.isPending && !view,
    offerStart,
    reasons: offerStart ? [] : laneReasonLines(lane),
    handedBack: claim?.status === 'self_file' && view?.packet ? view : null,
    badge: active && claim ? filingStatusDisplay(claim.status, claim.confirmation_number) : null,
    // The server offers "Start my claim" only on an agent lane, so its note is the agent one.
    note: offerStart && !lane ? copy.agentNote.text : claimNote({ status: claim?.status ?? null, lane, offerStart }),
    lane,
    onView,
  };
}
