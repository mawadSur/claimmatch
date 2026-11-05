import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { auth } from '@/copy/auth';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { AuthProvider, useAuth, type AuthContextValue } from '@/providers/AuthProvider';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));

type AuthCallback = (event: string, session: Session | null) => void;
const mockAuthApi = {
  callback: null as AuthCallback | null,
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  resetPasswordForEmail: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        mockAuthApi.callback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signUp: (...args: unknown[]) => mockAuthApi.signUp(...args),
      signInWithPassword: (...args: unknown[]) => mockAuthApi.signInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockAuthApi.resetPasswordForEmail(...args),
    },
  }),
  signOutOnThisDevice: async () => ({ error: null }),
}));

jest.mock('@/lib/reminders', () => ({ cancelAllReminders: jest.fn(async () => undefined) }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

let client: QueryClient;

async function renderWithAuth(children: React.ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await act(async () => mockAuthApi.callback?.('INITIAL_SESSION', null));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  mockAuthApi.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => client.clear());

describe('ForgotPasswordScreen', () => {
  async function requestLink(email: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(auth.emailLabel.text), email);
    await user.press(screen.getByRole('button', { name: auth.emailResetLink.text }));
  }

  it('checks the email first and sends nothing for a malformed one', async () => {
    await renderWithAuth(<ForgotPasswordScreen />);
    await requestLink('ana@');
    expect(screen.getByText(auth.enterSignUpEmail.text)).toBeOnTheScreen();
    expect(mockAuthApi.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('asks for the reset link with the web redirect and shows the same message whether or not the account exists', async () => {
    await renderWithAuth(<ForgotPasswordScreen />);
    await requestLink(' ana@example.com ');

    const sent = `${auth.ifAnAccountUses.text} ana@example.com${auth.weSentResetLink.text}`;
    expect(await screen.findByText(sent)).toBeOnTheScreen();
    expect(sent).toBe('If an account uses ana@example.com, we sent it a link to reset your password.');
    expect(mockAuthApi.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
      redirectTo: 'https://lawsuitai.org/auth/confirm?type=recovery',
    });
    expect(screen.getByText(auth.backToApp.text)).toBeOnTheScreen();
  });

  it('never reveals a missing account: other Supabase errors still show the sent message', async () => {
    mockAuthApi.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('User not found', 400, 'user_not_found'),
    });
    await renderWithAuth(<ForgotPasswordScreen />);
    await requestLink('nobody@example.com');
    expect(await screen.findByText(/If an account uses nobody@example.com/)).toBeOnTheScreen();
  });

  it('shows the rate limit and connection problems', async () => {
    mockAuthApi.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('Too many', 429, 'over_email_send_rate_limit'),
    });
    await renderWithAuth(<ForgotPasswordScreen />);
    await requestLink('ana@example.com');
    expect(await screen.findByText(auth.tooManyRequests.text)).toBeOnTheScreen();

    mockAuthApi.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthRetryableFetchError('Network request failed', 0),
    });
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: auth.emailResetLink.text }));
    expect(await screen.findByText(auth.checkConnection.text)).toBeOnTheScreen();
    expect(screen.queryByText(/If an account uses/)).toBeNull();
  });

  it('says an expired reset link expired, and goes back to log in', async () => {
    mockParams.current = { link: 'expired' };
    await renderWithAuth(<ForgotPasswordScreen />);
    expect(screen.getByText(auth.resetLinkExpired.text)).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('link', { name: auth.backToLogIn.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/login');
  });
});

describe('AuthProvider calls used by the auth screens', () => {
  it('signs up with the full name as metadata and the website callback as the email link', async () => {
    mockAuthApi.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    let value: AuthContextValue | null = null;
    function Probe() {
      value = useAuth();
      return null;
    }
    await renderWithAuth(<Probe />);
    await act(async () => {
      await value!.signUp({ email: ' ana@example.com ', password: 'long enough pw', fullName: ' Ana Díaz ' });
    });
    expect(mockAuthApi.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'long enough pw',
      options: { data: { full_name: 'Ana Díaz' }, emailRedirectTo: 'https://lawsuitai.org/auth/callback' },
    });

    mockAuthApi.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error: null });
    await act(async () => {
      await value!.signInWithPassword(' ana@example.com ', 'pw ');
    });
    await waitFor(() =>
      expect(mockAuthApi.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'pw ' }),
    );
  });
});
