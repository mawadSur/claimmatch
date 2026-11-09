import { Stack } from 'expo-router';

import { app } from '@/copy/app';
import { settings } from '@/copy/settings';
import { stackScreenOptions, tabRootScreenOptions } from '@/theme/navigation';

export const unstable_settings = {
  anchor: 'index',
};

export default function SettingsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ ...tabRootScreenOptions, title: app.tabSettings.text }} />
      <Stack.Screen name="details" options={{ title: settings.detailsTitle.text }} />
      <Stack.Screen name="legal" options={{ title: settings.legalTitle.text }} />
    </Stack>
  );
}
