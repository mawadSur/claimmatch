import { useRef, type ReactNode } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/ui';
import { CompactDisclaimer, SettleSignalCredit } from '@/features/shared';
import { useHeaderScroll } from '@/hooks/use-header-scroll';
import { useKeyboardInsetsActive } from '@/hooks/use-keyboard-insets';
import { colors, layout, space } from '@/theme/tokens';

import { ClaimGroupHeader, ClaimRowCard, ClaimsEmpty, ClaimsFailed, ClaimsHeader } from './ClaimRows';
import { ClosingSoon } from './ClosingSoon';
import { DashboardBanners, DashboardHeader, FinishProfileCard, WelcomeCard } from './DashboardIntro';
import { firstBatchSize, type DashboardItem } from './items';
import { NoticeList } from './NoticeList';
import type { DashboardResponse } from './types';
import type { DashboardNavigation } from './use-dashboard-navigation';
import type { NoticeAnswersState } from './use-notice-answers';
import { YourMatches } from './YourMatches';

export interface DashboardListProps {
  data: DashboardResponse;
  items: DashboardItem[];
  notices: NoticeAnswersState;
  possibleOpen: boolean;
  onTogglePossible: () => void;
  /** Pull to refresh. */
  refreshing: boolean;
  onRefresh: () => void;
  /** "Try again" on a failed claims section. */
  retrying: boolean;
  onRetry: () => void;
  nav: DashboardNavigation;
  /** See useHeaderScroll: the auth status. */
  restKey?: string;
}

/**
 * The signed-in dashboard: one virtualized list (the screen's only scroll
 * view, so the iOS large title collapses and a tab re-tap scrolls to top),
 * with pull to refresh.
 */
export function DashboardList({
  data,
  items,
  notices,
  possibleOpen,
  onTogglePossible,
  refreshing,
  onRefresh,
  retrying,
  onRetry,
  nav,
  restKey,
}: DashboardListProps) {
  // A notice row can ask for the confirmation number: keep its field above the keyboard, while this tab is focused.
  const keyboardInsets = useKeyboardInsetsActive(true);
  const listRef = useRef<FlatList<DashboardItem>>(null);
  const headerScroll = useHeaderScroll({
    scrollTo: (y, animated) => listRef.current?.scrollToOffset({ offset: y, animated }),
    restKey,
  });

  function content(item: DashboardItem): ReactNode {
    switch (item.type) {
      case 'header':
        return <DashboardHeader firstName={data.profile.firstName} />;
      case 'refetchError':
        return <Notice tone="error" body={item.message} testID="dashboard-refetch-error" />;
      case 'banners':
        return <DashboardBanners deniedAdmin={item.deniedAdmin} passwordUpdated={item.passwordUpdated} />;
      case 'welcome':
        return <WelcomeCard onBrowse={nav.openSettlements} />;
      case 'notices':
        return <NoticeList state={notices} />;
      case 'finishProfile':
        return <FinishProfileCard onFinish={nav.openOnboarding} />;
      case 'matches':
        return (
          <YourMatches
            matches={data.matches}
            needsProfile={data.profile.needsProfile}
            possibleOpen={possibleOpen}
            onTogglePossible={onTogglePossible}
            nav={nav}
          />
        );
      case 'claimsHeader':
        return <ClaimsHeader />;
      case 'claimsFailed':
        return <ClaimsFailed onRetry={onRetry} retrying={retrying} />;
      case 'claimsEmpty':
        return <ClaimsEmpty onBrowse={nav.openSettlements} />;
      case 'group':
        return <ClaimGroupHeader group={item.group} count={item.count} />;
      case 'claim':
        return <ClaimRowCard row={item.row} onOpen={nav.openClaim} />;
      case 'closingSoon':
        return <ClosingSoon closingSoon={data.closingSoon} nav={nav} />;
      case 'disclaimer':
        return (
          <View style={styles.footer}>
            <CompactDisclaimer testID="dashboard-disclaimer" />
            {/* The web's site footer, under every page, credits SettleSignal (src/components/Footer.tsx). */}
            <SettleSignalCredit variant="footer" testID="dashboard-credit" />
          </View>
        );
    }
  }

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => <View style={{ marginTop: item.gap }}>{content(item)}</View>}
      // Cells re-render when an answer, the open group or a retry changes.
      extraData={{ notices, possibleOpen, retrying, data }}
      initialNumToRender={firstBatchSize(items)}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets={keyboardInsets}
      {...headerScroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
      testID="dashboard-list"
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[4],
    paddingBottom: space[8],
  },
  footer: {
    gap: space[4],
  },
});
