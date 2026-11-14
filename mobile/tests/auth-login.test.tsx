import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import { AUTH_TIMEOUT_MS, AuthTimeoutError, withTimeout } from '@/features/auth/auth-helpers';
import { LoginScreen } from '@/features/auth/LoginScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string | string[]> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));

const mockSignIn = jest.fn();
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ signInWithPassword: mockSignIn }),
}));

const mockRequest = jest.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({ request: mockRequest }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

async function renderLogin(params: Record<string, string | string[]> = {}) {
  mockParams.current = params;
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LoginScreen />
    </SafeAreaProvider>,
  );
}

const signedIn = { data: { user: { id: 'user-1' }, session: { access_token: 't' } }, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue(signedIn);
});

describe('LoginScreen', () => {
  it('checks the email and password on the device and sends nothing until they are filled in', async () => {
    const user = userEvent.setup();
    await renderLogin();

    await user.press(screen.getByRole('button', { name: common.logIn.text }));

    expect(screen.getByText(auth.enterSignUpEmail.text)).toBeOnTheScreen();
    expect(screen.getByText(auth.enterYourPassword.text)).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();

    // Editing a field clears its error.
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'not-an-email');
    expect(screen.queryByText(auth.enterSignUpEmail.text)).toBeNull();
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(screen.getByText(auth.enterSignUpEmail.text)).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('uses the email and password keyboards and AutoFill types, and submits from the return key', async () => {
    const user = userEvent.setup();
    await renderLogin();
    const email = screen.getByLabelText(auth.emailLabel.text);
    const password = screen.getByLabelText(auth.passwordLabel.text);

    expect(email).toHaveProp('keyboardType', 'email-address');
    expect(email).toHaveProp('autoComplete', 'email');
    expect(email).toHaveProp('textContentType', 'username');
    expect(email).toHaveProp('returnKeyType', 'next');
    expect(password).toHaveProp('textContentType', 'password');
    expect(password).toHaveProp('autoComplete', 'current-password');
    expect(password).toHaveProp('secureTextEntry', true);

    await user.type(email, 'ana@example.com');
    await user.type(password, 'correct horse', { submitEditing: true });
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('ana@example.com', 'correct horse'));
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    await renderLogin();
    await user.press(screen.getByRole('button', { name: common.showPassword.text }));
    expect(screen.getByLabelText(auth.passwordLabel.text)).toHaveProp('secureTextEntry', false);
    await user.press(screen.getByRole('button', { name: common.hidePassword.text }));
    expect(screen.getByLabelText(auth.passwordLabel.text)).toHaveProp('secureTextEntry', true);
  });

  it('logs in, marks the session flags, and returns to the checked next', async () => {
    const user = userEvent.setup();
    await renderLogin({ next: '/claim/acme-data-breach' });

    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'correct horse');
    await user.press(screen.getByRole('button', { name: common.logIn.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/claim/acme-data-breach'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('/api/session-flags', { method: 'POST' });
  });

  it.each([
    [{}, '/dashboard'],
    [{ next: '/dashboard' }, '/dashboard'],
    [{ next: '/settings/details' }, '/settings/details'],
    [{ next: 'https://evil.example/claim/x' }, '/dashboard'],
    [{ next: '//evil.example' }, '/dashboard'],
    [{ next: '/onboarding' }, '/dashboard'],
    [{ next: ['/claim/acme', '/settings'] }, '/claim/acme'],
  ])('with params %j goes to %s after logging in', async (params, destination) => {
    const user = userEvent.setup();
    await renderLogin(params);
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'pw');
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(destination));
  });

  it('shows the Supabase message as sent, and the app network message when Supabase cannot be reached', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
    await renderLogin();
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'wrong');
    await user.press(screen.getByRole('button', { name: common.logIn.text }));

    expect(await screen.findByText('Invalid login credentials')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();

    mockSignIn.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    });
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(await screen.findByText(common.networkError.text)).toBeOnTheScreen();

    mockSignIn.mockRejectedValueOnce(new Error('boom'));
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(await screen.findByText(common.genericError.text)).toBeOnTheScreen();
  });

  it('greets people coming from a claim with sign-up, keeping the claim as next', async () => {
    const user = userEvent.setup();
    await renderLogin({ next: '/claim/acme' });

    expect(screen.getByRole('header', { name: shared.claimLoginTitle.text })).toBeOnTheScreen();
    expect(screen.getByText(shared.claimLoginBody.text)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: shared.createFreeAccount.text }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/signup', params: { next: '/claim/acme' } });

    // "New to Lawsuit AI?" once: the button above, without the "Create an account" link repeating it.
    expect(screen.getAllByText(shared.newToClaimMatch.text)).toHaveLength(1);
    expect(screen.queryByRole('link', { name: auth.createAnAccount.text })).toBeNull();
  });

  it('says "Welcome back" otherwise, links to sign-up and opens forgot password', async () => {
    const user = userEvent.setup();
    await renderLogin();
    expect(screen.getByRole('header', { name: shared.welcomeBack.text })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: shared.createFreeAccount.text })).toBeNull();
    await user.press(screen.getByRole('link', { name: auth.createAnAccount.text }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/signup');
    await user.press(screen.getByRole('link', { name: auth.forgotPasswordLink.text }));
    expect(mockRouter.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('keeps the email and password editable while signing in, so iOS does not offer to save an unchecked password', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mockSignIn.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderLogin();

    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'not-the-password');
    await user.press(screen.getByRole('button', { name: common.logIn.text }));

    // Signing in: only the button waits.
    expect(screen.getByRole('button', { name: auth.signingIn.text })).toBeDisabled();
    expect(screen.getByLabelText(auth.emailLabel.text)).toHaveProp('editable', true);
    expect(screen.getByLabelText(auth.passwordLabel.text)).toHaveProp('editable', true);
    // A second submit from the keyboard while the first one runs sends nothing.
    await fireEvent(screen.getByLabelText(auth.passwordLabel.text), 'submitEditing');
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    await act(async () => answer({ data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } }));
    expect(await screen.findByTestId('login-error')).toBeOnTheScreen();
    expect(screen.getByLabelText(auth.passwordLabel.text)).toHaveProp('editable', true);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('says the email is confirmed after a confirmation link', async () => {
    await renderLogin({ confirmed: '1', next: '/claim/acme' });
    expect(screen.getByText(`${auth.emailConfirmed.text} ${auth.toYourClaim.text}.`)).toBeOnTheScreen();
  });

  it('says the confirmation link expired', async () => {
    await renderLogin({ link: 'expired' });
    expect(screen.getByText(auth.confirmLinkExpired.text)).toBeOnTheScreen();
    expect(auth.confirmLinkExpired.text).toMatch(/resend the confirmation email/i);
    expect(auth.confirmLinkExpired.text).not.toMatch(/create your account again/i);
    expect(screen.queryByText(`${auth.emailConfirmed.text}.`)).toBeNull();
  });
});

describe('withTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('gives up after 12 seconds with the web timeout message, and clears its timer otherwise', async () => {
    jest.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const pending = withTimeout(never);
    jest.advanceTimersByTime(AUTH_TIMEOUT_MS);
    await expect(pending).rejects.toBeInstanceOf(AuthTimeoutError);
    const short = withTimeout(never, 10).catch((error: Error) => error.message);
    jest.advanceTimersByTime(10);
    await expect(short).resolves.toBe(auth.timeout.text);

    await expect(withTimeout(Promise.resolve('ok'))).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });
});
