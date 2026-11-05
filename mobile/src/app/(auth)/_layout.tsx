import { Stack } from 'expo-router';

import { ModalCloseButton } from '@/components/app/ModalCloseButton';
import { stackScreenOptions } from '@/theme/navigation';

/**
 * Sign-in screens, presented together as one modal over the app (root
 * layout). Each screen starts with its own headline, as the web pages do, so
 * the bar holds only Back and Close: long headlines such as "Log in or create
 * a free account" would be cut off in it.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ ...stackScreenOptions, title: '', headerRight: () => <ModalCloseButton /> }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="check-email" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
