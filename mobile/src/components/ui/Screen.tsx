import { useRef, type ReactNode } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type HostInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardOverlap } from '@/hooks/use-keyboard-overlap';
import { colors, layout, space, type SpaceToken } from '@/theme/tokens';

import { useInsideTabBar } from './tab-bar-context';

export interface ScreenProps {
  children: ReactNode;
  /**
   * true (default): content scrolls in a ScrollView, so nothing is cut off at
   * large text sizes. false: the screen brings its own list (FlatList) and
   * must set contentInsetAdjustmentBehavior="automatic" on it.
   */
  scroll?: boolean;
  /** Center the content vertically when it fits (empty, error and gate screens). */
  centered?: boolean;
  /** Pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Pinned bottom area for primary actions, kept above the home indicator and
   * the Android gesture bar, and above the keyboard while one is open (the
   * scroll area shrinks to fit). Only for screens outside the tab bar (claim
   * flow, modals): on iOS the tab bar would cover it, so tab screens keep
   * their actions in the content.
   */
  footer?: ReactNode;
  /** Set false when the route hides the native header, so content clears the status bar. */
  headerShown?: boolean;
  /** Vertical gap between direct children (default space[5]). */
  gap?: SpaceToken;
  /** Horizontal screen padding (default true). */
  padded?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Screen container. Safe areas: on iOS the scroll view adjusts its insets for
 * the header (transparent on iOS 26), status bar, tab bar and home indicator.
 * On Android the header is opaque and native tabs pad for the tab bar, so
 * only the status bar (no header) and the gesture bar (outside tabs) are
 * added here. The scroll view stays the first native child, which keeps
 * large titles collapsing and tab re-taps scrolling to top.
 */
export function Screen({
  children,
  scroll = true,
  centered = false,
  refreshing = false,
  onRefresh,
  footer,
  headerShown = true,
  gap = 5,
  padded = true,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const insideTabBar = useInsideTabBar();
  const android = Platform.OS === 'android';
  const rootRef = useRef<HostInstance>(null);
  // Only a footer needs this: without one, the scroll view insets itself for the keyboard.
  const keyboard = useKeyboardOverlap(rootRef, Boolean(footer));
  const bottomSafeArea = insideTabBar || keyboard.visible ? 0 : insets.bottom;

  const content = {
    paddingHorizontal: padded ? layout.screenPadding : 0,
    paddingTop: space[4] + (android && !headerShown ? insets.top : 0),
    paddingBottom: space[8] + (android && !footer ? bottomSafeArea : 0),
    gap: space[gap],
  };

  return (
    <View
      ref={rootRef}
      style={[styles.root, keyboard.height > 0 ? { paddingBottom: keyboard.height } : null]}
      collapsable={false}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentInsetAdjustmentBehavior="automatic"
          // With a footer the whole screen already sits above the keyboard; insetting again would leave a gap.
          automaticallyAdjustKeyboardInsets={!footer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={android ? 'on-drag' : 'interactive'}
          alwaysBounceVertical={!centered || Boolean(onRefresh)}
          contentContainerStyle={[content, centered ? styles.centered : null, contentContainerStyle]}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex} collapsable={false}>
          {children}
        </View>
      )}
      {footer ? (
        <View
          style={[styles.footer, { paddingBottom: space[3] + bottomSafeArea }]}
          testID={testID ? `${testID}-footer` : undefined}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    gap: space[3],
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[3],
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
});
