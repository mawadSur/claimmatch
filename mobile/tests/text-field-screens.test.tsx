import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type { ComponentProps, ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { SignupScreen } from '@/features/auth/SignupScreen';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';
import { DetailsForm } from '@/features/settings/DetailsForm';

/**
 * Every screen with text fields passes Screen's hasTextFields: while it is
 * focused, its scroll view then insets itself for the keyboard and scrolls a
 * covered field into view (iOS), and it stops once another screen covers it.
 * Without the prop the keyboard covered the lower fields.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: { id: 'user-1', email: 'ana@example.com' },
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    resetPasswordForEmail: jest.fn(),
  }),
}));
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({
    status: 'ready',
    isFlagOn: () => false,
    legal: { disclaimer: 'Full legal disclaimer text.', short: 'Short.', contactEmail: null, fromServer: true },
  }),
}));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: {} }) }));
jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

type NavigationValue = NonNullable<ComponentProps<typeof NavigationContext.Provider>['value']>;

/** The screen's navigation object, focused, with a blur the test can send. */
function focusedNavigation() {
  let focused = true;
  const blurListeners = new Set<() => void>();
  const navigation = {
    isFocused: () => focused,
    addListener: (type: string, listener: () => void) => {
      if (type !== 'blur') return () => undefined;
      blurListeners.add(listener);
      return () => blurListeners.delete(listener);
    },
  };
  return {
    navigation: navigation as unknown as NavigationValue,
    async blur() {
      focused = false;
      await act(async () => blurListeners.forEach((listener) => listener()));
    },
  };
}

/** The screen's own scroll view: the first native scroll view, around everything else. */
function screenScrollView() {
  const [scroll] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
  if (!scroll) throw new Error('The screen has no scroll view');
  return scroll;
}

const SCREENS: [string, () => ReactElement][] = [
  ['Log in', () => <LoginScreen />],
  ['Create your free account', () => <SignupScreen />],
  ['Choose a new password', () => <ResetPasswordScreen />],
  ['Forgot your password?', () => <ForgotPasswordScreen />],
  ['Your details', () => <DetailsForm profile={null} />],
  [
    'Onboarding',
    () => <OnboardingWizard initial={{ fullName: '', state: '', attributes: {} }} email="ana@example.com" next={null} emailConfirmed={false} />,
  ],
];

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { gcTime: Infinity } } });
});

afterEach(() => client.clear());

describe('screens with text fields', () => {
  it.each(SCREENS)('%s adjusts for the keyboard while focused, and stops when another screen covers it', async (_name, element) => {
    const { navigation, blur } = focusedNavigation();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <NavigationContext.Provider value={navigation}>{element()}</NavigationContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screenScrollView().props.automaticallyAdjustKeyboardInsets).toBe(true);

    await blur();
    expect(screenScrollView().props.automaticallyAdjustKeyboardInsets).toBe(false);
  });
});
