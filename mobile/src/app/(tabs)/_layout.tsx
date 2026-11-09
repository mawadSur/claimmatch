import { NativeTabs } from 'expo-router/native-tabs';
import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';

import { InsideTabBarContext } from '@/components/ui';
import { app } from '@/copy/app';
import { colors, fontFamilies } from '@/theme/tokens';

/**
 * Tab colors. On iOS 26 the Liquid Glass bar turns dark over dark content
 * and has no callback, so iOS colors are dynamic: navy and slate over light
 * content, white and light slate over dark (Expo's native tabs guide).
 * Android's Material bar is opaque white, so its colors are fixed.
 */
function overGlass(light: string, dark: string): ColorValue {
  return Platform.OS === 'ios' ? DynamicColorIOS({ light, dark }) : light;
}

const SELECTED = overGlass(colors.primary, colors.textInverse);
const UNSELECTED = overGlass(colors.textSoft, colors.textInverseMuted);

/**
 * Lucide icons (the app's and the website's icon family), rendered to PNGs by
 * scripts/generate-tab-icons.mjs. iOS draws them as templates in the colors
 * above. Android draws images in their own colors, so the selected image is
 * the navy one; every tab changes the same way when selected.
 */
const ICONS = {
  lawsuits: {
    default: require('@/assets/images/tabs/lawsuits.png'),
    selected: require('@/assets/images/tabs/lawsuits-selected.png'),
  },
  dashboard: {
    default: require('@/assets/images/tabs/dashboard.png'),
    selected: require('@/assets/images/tabs/dashboard-selected.png'),
  },
  settings: {
    default: require('@/assets/images/tabs/settings.png'),
    selected: require('@/assets/images/tabs/settings-selected.png'),
  },
};

/** The system tab bar (Liquid Glass on iOS 26, Material on Android). Each tab holds its own Stack. */
export default function TabsLayout() {
  return (
    <InsideTabBarContext.Provider value>
      <NativeTabs
        tintColor={SELECTED}
        iconColor={{ default: UNSELECTED, selected: SELECTED }}
        labelStyle={{
          default: { fontFamily: fontFamilies.sansSemibold, color: UNSELECTED },
          selected: { fontFamily: fontFamilies.sansSemibold, color: SELECTED },
        }}
        backgroundColor={colors.surface}
        indicatorColor={colors.surfaceBrand}
        rippleColor={colors.surfaceBrand}
      >
        <NativeTabs.Trigger name="lawsuits">
          <NativeTabs.Trigger.Label>{app.tabSettlements.text}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICONS.lawsuits} renderingMode="template" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="dashboard">
          <NativeTabs.Trigger.Label>{app.tabYourClaims.text}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICONS.dashboard} renderingMode="template" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Label>{app.tabSettings.text}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICONS.settings} renderingMode="template" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </InsideTabBarContext.Provider>
  );
}
