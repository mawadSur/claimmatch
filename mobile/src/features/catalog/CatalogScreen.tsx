import { filterCatalog } from '@shared/lib/catalog-page';
import { categoriesOf, isSettleSignalRecord } from '@shared/lib/lawsuit-display';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';

import { AppText, Button, EmptyState, ErrorState, Notice, Screen } from '@/components/ui';
import { RefreshCw, SearchX } from '@/components/ui/icons';
import { catalog } from '@/copy/catalog';
import { useCatalog, type CatalogLawsuit } from '@/data/catalog';
import { userFacingError } from '@/data/errors';
import {
  claimHref,
  claimRoute,
  settlementHref,
  SettleSignalCredit,
  ShortDisclaimer,
  UnverifiedNotice,
  useNow,
  usePullToRefresh,
} from '@/features/shared';
import { useKeyboardInsetsActive } from '@/hooks/use-keyboard-insets';
import { useConfig } from '@/providers/ConfigProvider';
import { colors, layout, radii, space } from '@/theme/tokens';

import { catalogStatusSegments } from './catalog-status';
import { CatalogCard } from './CatalogCard';
import { CatalogFilters } from './CatalogFilters';
import { CatalogFiltersSkeleton, CatalogSkeleton } from './CatalogSkeleton';
import { CatalogStatusLine } from './CatalogStatusLine';
import { useCatalogFilters } from './use-catalog-filters';

const NO_ROWS: CatalogLawsuit[] = [];

function keyOf(lawsuit: CatalogLawsuit): string {
  return lawsuit.id;
}

function Separator() {
  return <View style={styles.separator} />;
}

/**
 * /lawsuits, the Settlements tab (plan 3.3, src/app/lawsuits/page.tsx): the
 * intro and the amber unverified notice, the search box and filter chips,
 * the status line, one card per open settlement, the SettleSignal credit
 * when a SettleSignal listing is shown, and SHORT_DISCLAIMER at the end.
 * Search and filters run on the device over the whole open list
 * (filterCatalog, which sorts known deadlines first). The list is
 * virtualized; pull down to load it again.
 */
export function CatalogScreen() {
  const router = useRouter();
  const now = useNow();
  const { isFlagOn } = useConfig();
  const verifiedFieldsOn = isFlagOn('VERIFIED_FIELDS_ENABLED');
  const { data: lawsuits, status, error, isFetching, isRefetchError, refetch } = useCatalog();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  // The search field: only while this tab is focused, so another screen's keyboard leaves the list alone.
  const keyboardInsets = useKeyboardInsetsActive(true);
  const filters = useCatalogFilters();
  const { q, category, hasDeadline, proofNotRequired } = filters;

  // Category chips come from the whole open list, so they never depend on the search (page.tsx).
  const categories = useMemo(() => (lawsuits ? categoriesOf(lawsuits) : []), [lawsuits]);
  const rows = useMemo(
    () =>
      lawsuits
        ? filterCatalog(lawsuits, {
            q,
            category: category ?? undefined,
            hasDeadline,
            proof: proofNotRequired ? 'no' : undefined,
          })
        : NO_ROWS,
    // "No proof required" uses the verified proof rule while VERIFIED_FIELDS_ENABLED is on
    // (displayProofStatus reads the flag), so the list is filtered again when the flag arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lawsuits, q, category, hasDeadline, proofNotRequired, verifiedFieldsOn],
  );
  const showsSettleSignal = useMemo(() => rows.some(isSettleSignalRecord), [rows]);

  const startClaim = useCallback((slug: string) => router.push(claimRoute(claimHref(slug))), [router]);
  const showDetails = useCallback((slug: string) => router.push(settlementHref(slug)), [router]);
  const renderItem = useCallback<ListRenderItem<CatalogLawsuit>>(
    ({ item }) => <CatalogCard lawsuit={item} now={now} onStartClaim={startClaim} onShowDetails={showDetails} />,
    [now, startClaim, showDetails],
  );

  const failed = !lawsuits && status === 'error';
  const problem = userFacingError(error);

  const header = (
    <View style={styles.header}>
      <AppText variant="body" color="textMuted">
        {catalog.intro.text}
      </AppText>
      <UnverifiedNotice variant="catalog" />
      {lawsuits ? (
        <CatalogFilters categories={categories} filters={filters} />
      ) : status === 'pending' ? (
        <CatalogFiltersSkeleton />
      ) : null}
      {lawsuits || failed ? (
        <CatalogStatusLine
          segments={catalogStatusSegments({ failed, count: rows.length, category, q, hasDeadline, proofNotRequired })}
          testID="catalog-status"
        />
      ) : null}
      {/* Pulled to refresh and failed: the list below is the last one that loaded. */}
      {lawsuits && isRefetchError && problem ? <Notice tone="error" body={problem.message} /> : null}
    </View>
  );

  let empty: ReactElement;
  if (lawsuits) {
    empty = (
      <View style={styles.emptyBox}>
        <EmptyState
          icon={SearchX}
          title={filters.active ? catalog.emptyFilteredTitle.text : catalog.emptyTitle.text}
          body={filters.active ? catalog.emptyFilteredBody.text : catalog.emptyBody.text}
          action={
            filters.active ? (
              <Button label={catalog.clearFilters.text} variant="secondary" onPress={filters.clearAll} fullWidth />
            ) : undefined
          }
          testID="catalog-empty"
        />
      </View>
    );
  } else if (failed) {
    empty = (
      <View style={styles.emptyBox}>
        <ErrorState
          icon={RefreshCw}
          title={catalog.errorTitle.text}
          // Offline is the one failure the person can fix, so it gets its own words.
          body={problem?.code === 'network' ? problem.message : catalog.errorBody.text}
          onRetry={() => {
            void refetch();
          }}
          retrying={isFetching}
          testID="catalog-error"
        />
      </View>
    );
  } else {
    empty = <CatalogSkeleton />;
  }

  const footer = (
    <View style={styles.footer}>
      {showsSettleSignal ? <SettleSignalCredit testID="catalog-credit" /> : null}
      <ShortDisclaimer testID="catalog-short-disclaimer" />
    </View>
  );

  return (
    <Screen scroll={false} testID="catalog-screen">
      <FlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.headerSpacing}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ListFooterComponentStyle={styles.footerSpacing}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets={keyboardInsets}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
        initialNumToRender={5}
        maxToRenderPerBatch={8}
        windowSize={11}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        testID="catalog-list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[4],
    paddingBottom: space[8],
  },
  header: {
    gap: space[5],
  },
  headerSpacing: {
    paddingBottom: space[5],
  },
  separator: {
    height: space[5],
  },
  emptyBox: {
    paddingHorizontal: space[6],
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footer: {
    gap: space[4],
  },
  footerSpacing: {
    paddingTop: space[8],
  },
});
