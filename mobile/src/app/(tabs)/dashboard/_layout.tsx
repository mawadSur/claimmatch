import { Stack } from 'expo-router';

import { dashboard } from '@/copy/dashboard';
import { stackScreenOptions, tabRootScreenOptions } from '@/theme/navigation';

export const unstable_settings = {
  anchor: 'index',
};

export default function DashboardLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ ...tabRootScreenOptions, title: dashboard.title.text }} />
    </Stack>
  );
}
