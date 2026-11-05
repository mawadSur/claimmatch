import { isFictionalSlug } from '@shared/lib/fictional-slugs';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { Button, ErrorState, Notice, Screen } from '@/components/ui';
import { app } from '@/copy/app';
import { useSettlement } from '@/data/catalog';
import { userFacingError } from '@/data/errors';
import { claimHref, claimRoute, useNow, usePullToRefresh } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';

import { SettlementDetail } from './SettlementDetail';
import { SettlementNotFound, SettlementSkeleton } from './SettlementStates';

export interface SettlementScreenProps {
  /** The route's slug, as given (it may name a fictional, closed or unknown listing). */
  slug: string;
}

/**
 * /lawsuits/{slug}, settlement detail (plan 3.3). Opens at once from the
 * catalog's copy of the row, otherwise shows a skeleton while it loads.
 * Fictional and unknown slugs get the web's not-found wording, and a failed
 * load the error page's wording with "Try again". Pull down to load again.
 */
export function SettlementScreen({ slug }: SettlementScreenProps) {
  const router = useRouter();
  const now = useNow();
  const { status: authStatus } = useAuth();
  const fictionalSlug = isFictionalSlug(slug);
  const { data, status, error, isFetching, isRefetchError, refetch } = useSettlement(slug);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const problem = userFacingError(error);

  const browse = useCallback(() => router.dismissTo('/lawsuits'), [router]);
  const lawsuitSlug = data?.status === 'found' ? data.lawsuit.slug : null;
  const startClaim = useCallback(() => {
    if (lawsuitSlug) router.push(claimRoute(claimHref(lawsuitSlug)));
  }, [router, lawsuitSlug]);

  if (fictionalSlug || data?.status === 'missing') {
    return (
      <SettlementNotFound
        fictional={fictionalSlug || (data?.status === 'missing' && data.fictional)}
        onBrowse={browse}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  if (data?.status === 'found') {
    return (
      <Screen gap={6} refreshing={refreshing} onRefresh={onRefresh} testID="settlement-screen">
        {/* Pulled to refresh and failed: the page below is the last one that loaded. */}
        {isRefetchError && problem ? <Notice tone="error" body={problem.message} /> : null}
        <SettlementDetail
          lawsuit={data.lawsuit}
          now={now}
          signedIn={authStatus === 'signedIn'}
          onStartClaim={startClaim}
          onBrowse={browse}
        />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen centered refreshing={refreshing} onRefresh={onRefresh} testID="settlement-error">
        <ErrorState
          // Offline is the one failure the person can fix, so it gets its own words (src/app/lawsuits/error.tsx otherwise).
          body={problem?.code === 'network' ? problem.message : undefined}
          onRetry={() => {
            void refetch();
          }}
          retrying={isFetching}
          secondaryAction={
            <Button label={app.browseOpenSettlements.text} variant="secondary" onPress={browse} fullWidth />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen testID="settlement-pending">
      <SettlementSkeleton />
    </Screen>
  );
}
