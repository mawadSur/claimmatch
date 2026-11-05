import { Stack } from 'expo-router';

import { catalog } from '@/copy/catalog';
import { settlement } from '@/copy/settlement';
import { stackScreenOptions, tabRootScreenOptions } from '@/theme/navigation';

export const unstable_settings = {
  // A deep link to /lawsuits/{slug} keeps the catalog underneath.
  anchor: 'index',
};

export default function LawsuitsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ ...tabRootScreenOptions, title: catalog.title.text }} />
      <Stack.Screen name="[slug]" options={{ title: settlement.screenTitle.text }} />
    </Stack>
  );
}
