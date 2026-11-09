import { StyleSheet, View } from 'react-native';

import { Button, ErrorState, Screen, Skeleton } from '@/components/ui';
import { dashboard } from '@/copy/dashboard';
import { userFacingError } from '@/data/errors';
import { radii, space } from '@/theme/tokens';

/**
 * The dashboard while it loads (src/app/dashboard/loading.tsx) and when the
 * whole request fails (src/app/dashboard/error.tsx).
 */

/** Pulsing placeholders for the greeting and three cards; read as "Loading your claims…". */
export function DashboardSkeleton({ restKey }: { restKey?: string }) {
  return (
    <Screen restKey={restKey} testID="dashboard-loading">
      <View
        accessible
        accessibilityLabel={dashboard.loading.text}
        accessibilityState={{ busy: true }}
        style={styles.skeleton}
      >
        <View style={styles.lines}>
          <Skeleton width={128} height={24} radius={radii.full} />
          <Skeleton width={256} height={36} radius={radii.xl} />
          <Skeleton height={16} />
        </View>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={112} radius={radii['2xl']} />
        ))}
      </View>
    </Screen>
  );
}

/**
 * The error's own text when it says more than "on our side" (no connection,
 * the session could not be checked, too many requests); otherwise the web's.
 */
export function loadErrorBody(error: unknown): string {
  const failure = userFacingError(error);
  if (!failure) return dashboard.errorBody.text;
  const explained =
    failure.code === 'network' || failure.code === 'aborted' || failure.code === 'auth_unavailable' || failure.status === 429;
  return explained ? failure.message : dashboard.errorBody.text;
}

export interface DashboardLoadErrorProps {
  error: unknown;
  /** "Try again" is loading. */
  retrying: boolean;
  onRetry: () => void;
  /** Pull to refresh is running. */
  pulling: boolean;
  onPull: () => void;
  onBrowse: () => void;
  /** The auth status (Screen restKey). */
  restKey?: string;
}

/** "We couldn’t load your claims", Try again and Browse settlements. Never an empty or guessed list. */
export function DashboardLoadError({ error, retrying, onRetry, pulling, onPull, onBrowse, restKey }: DashboardLoadErrorProps) {
  return (
    <Screen centered refreshing={pulling} onRefresh={onPull} restKey={restKey} testID="dashboard-error">
      <ErrorState
        title={dashboard.errorTitle.text}
        body={loadErrorBody(error)}
        onRetry={onRetry}
        retrying={retrying && !pulling}
        secondaryAction={
          <Button label={dashboard.browseSettlements.text} variant="secondary" onPress={onBrowse} fullWidth />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    gap: space[8],
  },
  lines: {
    gap: space[3],
  },
});
