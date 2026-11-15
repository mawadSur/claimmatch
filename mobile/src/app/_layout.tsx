import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ConfigurationError } from '@/components/app/ConfigurationError';
import { ModalCloseButton } from '@/components/app/ModalCloseButton';
import { UpdateRequired } from '@/components/app/UpdateRequired';
import { app } from '@/copy/app';
import { auth } from '@/copy/auth';
import { claim } from '@/copy/claim';
import { settings } from '@/copy/settings';
import { useOnboardingGate } from '@/features/onboarding/gate';
import { envCheck } from '@/lib/env';
import { useReminderTaps } from '@/lib/reminders';
import { AppProviders } from '@/providers/AppProviders';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/ConfigProvider';
import { fontAssets } from '@/theme/fonts';
import { navigationTheme, stackScreenOptions } from '@/theme/navigation';

// Keep the native splash up until fonts and the stored session are ready.
void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  // A deep link such as /claim/{slug} opens with the tabs underneath, so back leads home.
  anchor: '(tabs)',
};

function useHideSplashWhen(ready: boolean) {
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // If fonts fail, the system font is used rather than blocking the app.
  const fontsReady = fontsLoaded || fontError != null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      {envCheck.ok ? (
        <AppProviders>
          <App fontsReady={fontsReady} />
        </AppProviders>
      ) : (
        <MisconfiguredApp fontsReady={fontsReady} />
      )}
    </ThemeProvider>
  );
}

function MisconfiguredApp({ fontsReady }: { fontsReady: boolean }) {
  useHideSplashWhen(fontsReady);
  if (!fontsReady || envCheck.ok) return null;
  return <ConfigurationError problems={envCheck.problems} />;
}

function App({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useAuth();
  const { updateRequired } = useConfig();
  const ready = fontsReady && status !== 'loading';
  useHideSplashWhen(ready);

  if (!ready) return null;
  if (updateRequired) return <UpdateRequired />;
  return <RootStack />;
}

function RootStack() {
  // A tapped deadline reminder opens its claim, also when the tap launched the app.
  useReminderTaps();
  // After sign-in, onboarding opens once per session while the profile is not onboarded.
  useOnboardingGate();
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The title names this entry in the iOS back-button menu (never the route name "(tabs)"). */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: app.appName.text }} />
      {/* Opens on every cold start and is dismissed at once (index.tsx): never animate it. */}
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="claim/[slug]" options={{ title: claim.screenTitle.text }} />
      <Stack.Screen
        name="onboarding"
        options={{
          presentation: 'fullScreenModal',
          // The screen starts with its own "Welcome to Lawsuit AI" headline.
          title: '',
          headerRight: () => <ModalCloseButton />,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          presentation: 'modal',
          title: settings.deleteTitle.text,
          headerRight: () => <ModalCloseButton />,
        }}
      />
      <Stack.Screen name="(auth)" options={{ presentation: 'modal', headerShown: false, title: app.appName.text }} />
      {/* The email-link screens start with their own headlines; the callback shows only a spinner. */}
      <Stack.Screen name="auth/confirm" options={{ title: '' }} />
      <Stack.Screen name="auth/callback" options={{ title: auth.confirmYourEmail.text }} />
      <Stack.Screen name="reset-password" options={{ title: '' }} />
      <Stack.Screen name="+not-found" options={{ title: '' }} />
    </Stack>
  );
}
