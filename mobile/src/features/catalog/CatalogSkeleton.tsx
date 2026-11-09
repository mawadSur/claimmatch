import { StyleSheet, View } from 'react-native';

import { Card, Skeleton } from '@/components/ui';
import { common } from '@/copy/common';
import { radii, space, touchTarget } from '@/theme/tokens';

/** Placeholder for the search box and the chip row while the catalog loads. Hidden from screen readers. */
export function CatalogFiltersSkeleton() {
  return (
    <View style={styles.filters}>
      <Skeleton height={touchTarget + 4} radius={radii.lg} />
      <View style={styles.row}>
        <Skeleton width={56} height={touchTarget} radius={radii.full} />
        <Skeleton width={112} height={touchTarget} radius={radii.full} />
        <Skeleton width={96} height={touchTarget} radius={radii.full} />
      </View>
    </View>
  );
}

/** Three card-shaped placeholders, announced once as "Loading". */
export function CatalogSkeleton() {
  return (
    <View accessible accessibilityLabel={common.loading.text} style={styles.cards} testID="catalog-loading">
      {[0, 1, 2].map((key) => (
        <Card key={key} style={styles.card}>
          <View style={styles.row}>
            <Skeleton width={96} height={24} radius={radii.full} />
            <Skeleton width={88} height={24} radius={radii.full} />
          </View>
          <Skeleton width="85%" height={22} />
          <Skeleton width="60%" height={22} />
          <Skeleton height={14} />
          <Skeleton width="70%" height={14} />
          <Skeleton height={92} radius={radii.xl} />
          <View style={styles.row}>
            <View style={styles.grow}>
              <Skeleton height={touchTarget + 4} radius={radii.lg} />
            </View>
            <Skeleton width={96} height={touchTarget + 4} radius={radii.lg} />
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: space[3],
  },
  cards: {
    gap: space[5],
  },
  card: {
    gap: space[3],
  },
  row: {
    flexDirection: 'row',
    gap: space[2],
  },
  grow: {
    flex: 1,
  },
});
