import { DefaultTheme, type NativeStackNavigationOptions, type Theme } from 'expo-router';
import { Platform } from 'react-native';

import { colors, fontFamilies } from './tokens';

/**
 * Navigation theme (light only). Fonts use 'normal' weight because each
 * weight is its own family.
 */
export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.divider,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: fontFamilies.sans, fontWeight: 'normal' },
    medium: { fontFamily: fontFamilies.sansSemibold, fontWeight: 'normal' },
    bold: { fontFamily: fontFamilies.sansBold, fontWeight: 'normal' },
    heavy: { fontFamily: fontFamilies.sansBold, fontWeight: 'normal' },
  },
};

/**
 * Options shared by every Stack. On iOS 26 and later the header is the
 * system's Liquid Glass bar and uses system fonts unless fontFamily is set
 * (SDK 58), so the families are set here. Android headers are opaque and take
 * the screen background.
 *
 * The iOS back button shows the chevron only. A custom back-title font
 * (headerBackTitleStyle, or the theme fonts on iOS 18 and earlier) turns off
 * UIKit's space-aware back title, which then always shows the previous
 * screen's full title; 'minimal' hides the title on every iOS version.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerTintColor: colors.primary,
  headerTitleStyle: { fontFamily: fontFamilies.sansSemibold, color: colors.text },
  headerLargeTitleStyle: { fontFamily: fontFamilies.display, color: colors.text },
  headerBackButtonDisplayMode: 'minimal',
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
  ...(Platform.OS === 'android' ? { headerStyle: { backgroundColor: colors.background } } : null),
};

/**
 * First screen of each tab, where the headline is the screen title. iOS: a
 * Newsreader large title that collapses on scroll (needs a Screen with a
 * ScrollView). Android has no large titles, so its header title uses
 * Newsreader instead, like the website's serif headlines.
 */
export const tabRootScreenOptions: NativeStackNavigationOptions =
  Platform.OS === 'ios'
    ? { headerLargeTitleEnabled: true }
    : { headerTitleStyle: { fontFamily: fontFamilies.display, color: colors.text } };
