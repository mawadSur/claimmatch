import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import { Info, Search, SearchX } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { common } from '@/copy/common';
import { settlement } from '@/copy/settlement';
import { radii, space, touchTarget } from '@/theme/tokens';

export interface SettlementNotFoundProps {
  /** One of the fictional test listings (FICTIONAL_SLUGS). */
  fictional: boolean;
  onBrowse(): void;
  refreshing?: boolean;
  /** Pull to check again; not offered for a fictional listing, which never comes back. */
  onRefresh?: () => void;
}

/**
 * A settlement that does not exist, is not listed, or was test data
 * (src/app/lawsuits/[slug]/not-found.tsx). People who followed an old link
 * to a fictional listing are told plainly that there is nothing to file;
 * anyone else is sent to the official notice, never told "nothing to file".
 */
export function SettlementNotFound({ fictional, onBrowse, refreshing, onRefresh }: SettlementNotFoundProps) {
  return (
    <Screen centered refreshing={refreshing} onRefresh={fictional ? undefined : onRefresh} testID="settlement-not-found">
      <EmptyState
        icon={fictional ? Info : SearchX}
        title={fictional ? settlement.fictionalTitle.text : settlement.notFoundTitle.text}
        body={fictional ? settlement.fictionalBody.text : settlement.notFoundBody.text}
        action={<Button label={app.browseOpenSettlements.text} icon={Search} onPress={onBrowse} fullWidth />}
      />
    </Screen>
  );
}

/** The settlement page's shape while it loads, announced once as "Loading". */
export function SettlementSkeleton() {
  return (
    <View accessible accessibilityLabel={common.loading.text} style={styles.stack} testID="settlement-loading">
      <View style={styles.row}>
        <Skeleton width={96} height={24} radius={radii.full} />
        <Skeleton width={112} height={24} radius={radii.full} />
      </View>
      <View style={styles.tight}>
        <Skeleton width="92%" height={32} />
        <Skeleton width="64%" height={32} />
      </View>
      <View style={styles.tight}>
        <Skeleton height={16} />
        <Skeleton width="80%" height={16} />
      </View>
      <Card style={styles.card}>
        <Skeleton width="45%" height={22} />
        <Skeleton height={14} />
        <Skeleton width="70%" height={14} />
        <Skeleton width="55%" height={14} />
        <Skeleton height={touchTarget + 4} radius={radii.lg} />
      </Card>
      <Skeleton height={touchTarget + 4} radius={radii.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[6],
  },
  row: {
    flexDirection: 'row',
    gap: space[2],
  },
  tight: {
    gap: space[2],
  },
  card: {
    gap: space[3],
  },
});
