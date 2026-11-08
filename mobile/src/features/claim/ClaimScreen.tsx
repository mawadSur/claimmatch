import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useRef, useState, type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice, Screen } from '@/components/ui';
import { loadErrorTitle } from '@/copy/claim';
import { common } from '@/copy/common';
import { claimLoadErrorWhat, useClaimScreen, type ClaimScreenResult, type FlowClaimScreen } from '@/data/claims';
import { userFacingError } from '@/data/errors';
import { useRefetchOnFocus } from '@/data/focus';
import { CompactDisclaimer, SettleSignalCredit, usePullToRefresh } from '@/features/shared';
import { useHeaderScroll } from '@/hooks/use-header-scroll';
import { useKeyboardInsetsActive } from '@/hooks/use-keyboard-insets';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useAuth } from '@/providers/AuthProvider';
import { colors, layout, space } from '@/theme/tokens';

import { ClaimFlow } from './ClaimFlow';
import { ClaimHeader, ClaimLoadError, ClaimLoadFailed, ClaimLoading, ClaimNotFound, ClaimSignedOut } from './ClaimStates';
import { ClosedClaim } from './ClosedClaim';
import { FlowTargetsProvider, useFlowTargets } from './flow-targets';

/**
 * Whether the user had a claim when the screen last loaded (the web's
 * `initialClaim`). It changes when a load finishes, not when a write puts
 * the new claim into the cache, so the no-longer-open card stays in place
 * while "I filed my claim" starts the claim.
 */
function useClaimAtLoad(data: ClaimScreenResult | undefined, fetching: boolean): boolean {
  const hasClaim = data?.kind === 'flow' && data.claim !== null;
  const [seen, setSeen] = useState({ fetching, atLoad: hasClaim });
  if (seen.fetching !== fetching) {
    // A load started or finished: keep the value while it runs, take the loaded one after.
    const next = { fetching, atLoad: fetching ? seen.atLoad : hasClaim };
    setSeen(next);
    return next.atLoad;
  }
  return seen.atLoad;
}

/** What a failed reload says above the claim, which stays on screen with anything typed into it. */
interface ReloadProblem {
  title?: string;
  body: string;
}

function reloadProblem(error: unknown): ReloadProblem | null {
  const what = claimLoadErrorWhat(error);
  if (what !== undefined) return { title: loadErrorTitle(what, common.loadErrorTitle.text), body: common.loadErrorBody.text };
  const shown = userFacingError(error);
  return shown ? { body: shown.message } : null;
}

function FlowScreen({
  data,
  claimAtLoad,
  refreshing,
  onRefresh,
  refreshError,
}: {
  data: FlowClaimScreen;
  claimAtLoad: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  refreshError: ReloadProblem | null;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const reduceMotion = useReducedMotion();
  const keyboardInsets = useKeyboardInsetsActive(true);
  const headerScroll = useHeaderScroll({ scrollTo: (y, animated) => scrollRef.current?.scrollTo({ y, animated }) });
  const android = Platform.OS === 'android';
  // How much of the scroll view a header covers: all of the header when the
  // content runs under it (a transparent header), none when it sits above.
  const coveredTop = useRef(0);
  const targets = useFlowTargets(scrollRef, {
    topInset: () => coveredTop.current + space[3],
    animated: !reduceMotion,
  });
  const measureCover = () =>
    scrollRef.current?.measureInWindow((_x, y) => {
      coveredTop.current = Math.max(0, headerHeight - y);
    });

  return (
    <Screen scroll={false} testID="claim-flow">
      <ScrollView
        ref={scrollRef}
        onLayout={measureCover}
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets={keyboardInsets}
        {...headerScroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={android ? 'on-drag' : 'interactive'}
        contentContainerStyle={[styles.content, { paddingBottom: space[8] + (android ? insets.bottom : 0) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        testID="claim-scroll"
      >
        <FlowTargetsProvider value={targets}>
          {refreshError ? (
            <Notice tone="error" title={refreshError.title} body={refreshError.body} testID="claim-refresh-error" />
          ) : null}
          <ClaimHeader category={data.category} title={data.title} />
          <ClaimFlow data={data} claimAtLoad={claimAtLoad} />
          <CompactDisclaimer testID="claim-disclaimer" />
          {/* The web's site footer, under every page, credits SettleSignal (src/components/Footer.tsx). */}
          <SettleSignalCredit variant="footer" testID="claim-credit" />
        </FlowTargetsProvider>
      </ScrollView>
    </Screen>
  );
}

/**
 * /claim/{slug} (plan 3.3, Claim): GET /api/mobile/claim/{slug}, always
 * stale, loaded again on focus and on pull. Signed out (401): the claim
 * log-in prompt. 404: not found. 503: the load error with Try again, unless
 * the screen already shows the claim: a reload that fails keeps it and says
 * why above it. Closed: the closed card. Otherwise the claim flow.
 */
export function ClaimScreen({ slug }: { slug: string }): ReactNode {
  const query = useClaimScreen(slug);
  const { sessionEnded } = useAuth();
  const { data, error, isError, isFetching, refetch } = query;
  useRefetchOnFocus(refetch);
  const claimAtLoad = useClaimAtLoad(data, isFetching);
  const pull = usePullToRefresh(refetch);
  const retry = () => void refetch();

  if (!data) {
    if (!isError) return <ClaimLoading />;
    const what = claimLoadErrorWhat(error);
    return what !== undefined ? (
      <ClaimLoadError what={what} onRetry={retry} retrying={isFetching} />
    ) : (
      <ClaimLoadFailed error={error} onRetry={retry} retrying={isFetching} />
    );
  }
  switch (data.kind) {
    case 'signed_out':
      // A claim write that found the session dead signed out on this device:
      // its answer (with "Log in again") is gone with the claim, so say why here.
      return <ClaimSignedOut slug={slug} loggedOut={data.loggedOut || sessionEnded} />;
    case 'not_found':
      return <ClaimNotFound />;
    case 'closed':
      return <ClosedClaim data={data} refreshing={pull.refreshing} onRefresh={pull.onRefresh} />;
    case 'flow':
      return (
        <FlowScreen
          data={data}
          claimAtLoad={claimAtLoad}
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          refreshError={isError ? reloadProblem(error) : null}
        />
      );
  }
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[4],
    gap: space[5],
  },
});
