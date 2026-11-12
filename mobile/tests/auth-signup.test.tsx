import {
  SIGNUP_RESEND_SENT,
  firstSignupFieldError,
  signupErrorMessage,
  signupPasswordHint,
  validateSignupFields,
} from '@shared/lib/signup-validation';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { auth, passwordTooShortText } from '@/copy/auth';
import { common } from '@/copy/common';
import { signupAuthError } from '@/features/auth/auth-helpers';
import { CheckEmailScreen, checkEmailHref } from '@/features/auth/CheckEmailScreen';
import { signupFieldErrors, SignupScreen } from '@/features/auth/SignupScreen';
import { openExternalUrl } from '@/lib/external-link';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string | string[]> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));

const mockSignUp = jest.fn();
const mockResend = jest.fn();
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ signUp: mockSignUp }),
}));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      resend: (...args: unknown[]) => mockResend(...args),
    },
  }),
}));

const mockFlags: { on: string[]; status: string } = { on: [], status: 'ready' };
jest.mock('@/providers/ConfigProvider', () => ({
  useConfig: () => ({ status: mockFlags.status, isFlagOn: (name: string) => mockFlags.on.includes(name) }),
}));

const mockRequest = jest.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({ request: mockRequest }),
}));

jest.mock('@/lib/external-link', () => ({
  ...jest.requireActual('@/lib/external-link'),
  openExternalUrl: jest.fn(async () => null),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

async function renderScreen(element: React.ReactElement, params: Record<string, string | string[]> = {}) {
  mockParams.current = params;
  await render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 'long enough pw') {
  await user.type(screen.getByLabelText(auth.fullNameLabel.text), 'Ana Díaz');
  await user.type(screen.getByLabelText(auth.emailLabel.text), ' ana@example.com ');
  await user.type(screen.getByLabelText(auth.passwordLabel.text), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlags.on = [];
  mockFlags.status = 'ready';
  mockSignUp.mockResolvedValue({ data: { user: { id: 'user-2' }, session: null }, error: null });
  mockResend.mockResolvedValue({ data: {}, error: null });
});

describe('SignupScreen', () => {
  it('needs a password of at least 10 characters and an email, checked on the device', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'short');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    expect(screen.getByText(passwordTooShortText(10))).toBeOnTheScreen();
    expect(passwordTooShortText(10)).toBe('Use at least 10 characters for your password.');
    expect(screen.getByText(auth.enterYourEmail.text)).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(auth.passwordLabel.text));
    await fillForm(user, '123456789');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    expect(screen.getByText(passwordTooShortText(10))).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('says what the website says for a malformed email and an empty password', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    await user.type(screen.getByLabelText(auth.fullNameLabel.text), 'Ana Díaz');
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a password.')).toBeOnTheScreen();
    expect(screen.queryByText(auth.enterYourEmail.text)).toBeNull();
    expect(screen.queryByText(passwordTooShortText(10))).toBeNull();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('picks the same message as the website’s validateSignupFields for every name, email and password, in its order', () => {
    const names = ['', '   ', 'Ana Díaz', ' A '];
    const emails = ['', '   ', 'ana', 'ana@', '@example.com', 'ana@example', 'ana@example.', 'ana@example.com', ' ana@example.com ', 'ana@@example.com', 'a@b@example.com', 'ana maria@example.com'];
    const passwords = ['', ' ', 'short', '123456789', '1234567890', '          ', 'long enough pw'];
    for (const fullName of names) {
      for (const email of emails) {
        for (const password of passwords) {
          const web = validateSignupFields({ fullName, email, password });
          const app = signupFieldErrors({ fullName, email, password });
          // The inputs ride along, so a failure names them.
          expect({ fullName, email, password, nameError: app.fullName, emailError: app.email, passwordError: app.password }).toEqual({
            fullName,
            email,
            password,
            nameError: web.full_name ?? null,
            emailError: web.email ?? null,
            passwordError: web.password ?? null,
          });
          // The first message is the website's first (firstSignupFieldError: name, email, password).
          expect({ fullName, email, password, first: Object.values(app).find(Boolean) ?? null }).toEqual({
            fullName,
            email,
            password,
            first: firstSignupFieldError(web)?.message ?? null,
          });
        }
      }
    }
  });

  it('asks for a name with the website’s words, and sends nothing without one', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@example.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'long enough pw');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    expect(auth.enterYourName.text).toBe('Enter your name.');
    expect(screen.getByText(auth.enterYourName.text)).toBeOnTheScreen();
    expect(screen.getByLabelText(auth.fullNameLabel.text)).toHaveProp('accessibilityHint', auth.enterYourName.text);
    expect(mockSignUp).not.toHaveBeenCalled();

    // Typing clears the message, as on the website; spaces alone are still no name.
    await user.type(screen.getByLabelText(auth.fullNameLabel.text), '   ');
    expect(screen.queryByText(auth.enterYourName.text)).toBeNull();
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    expect(screen.getByText(auth.enterYourName.text)).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(auth.fullNameLabel.text));
    await user.type(screen.getByLabelText(auth.fullNameLabel.text), 'Ana Díaz');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'long enough pw', fullName: 'Ana Díaz' }),
    );
    expect(screen.queryByText(auth.enterYourName.text)).toBeNull();
  });

  it('says what is missing in the website’s order, the name first', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    const announced = (AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock).mock.calls.map(([message]) => message);
    expect(announced).toEqual([auth.enterYourName.text, auth.enterYourEmail.text, auth.enterAPassword.text]);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('sets up the fields for the keyboard, AutoFill and a new password', async () => {
    await renderScreen(<SignupScreen />);
    const name = screen.getByLabelText(auth.fullNameLabel.text);
    const email = screen.getByLabelText(auth.emailLabel.text);
    const password = screen.getByLabelText(auth.passwordLabel.text);
    expect(name).toHaveProp('textContentType', 'name');
    expect(name).toHaveProp('autoComplete', 'name');
    expect(email).toHaveProp('keyboardType', 'email-address');
    expect(email).toHaveProp('autoCapitalize', 'none');
    expect(password).toHaveProp('textContentType', 'newPassword');
    expect(password).toHaveProp('autoComplete', 'new-password');
    expect(password).toHaveProp('placeholder', 'At least 10 characters');
  });

  it('creates the account and, while the email is unconfirmed, opens Check your email with the next path', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />, { next: '/claim/acme' });
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    // The address never goes into the URL: Check your email gets it in memory.
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/check-email', params: { next: '/claim/acme' } }),
    );
    expect(mockSignUp).toHaveBeenCalledWith({ email: ' ana@example.com ', password: 'long enough pw', fullName: 'Ana Díaz' });
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();

    await renderScreen(<CheckEmailScreen />, { next: '/claim/acme' });
    expect(
      screen.getByText(`${auth.sentConfirmationTo.text} ana@example.com. ${auth.openItToVerify.text}`),
    ).toBeOnTheScreen();
  });

  it('goes straight in when Supabase returns a session, marking the session flags', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'user-2' }, session: { access_token: 't' } }, error: null });
    await renderScreen(<SignupScreen />);
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/dashboard'));
    expect(mockRequest).toHaveBeenCalledWith('/api/session-flags', { method: 'POST' });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('shows a mapped message for the email rate limit, never the provider text', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'Email rate limit exceeded' } });
    await renderScreen(<SignupScreen />);
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    expect(await screen.findByText(signupErrorMessage('rate_limited'))).toBeOnTheScreen();
    expect(screen.queryByText('Email rate limit exceeded')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('treats a successful signup with empty identities as an existing account', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: 'placeholder', identities: [] }, session: null },
      error: null,
    });
    await renderScreen(<SignupScreen />, { next: '/claim/acme' });
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    expect(await screen.findByText(signupErrorMessage('email_exists'))).toBeOnTheScreen();
    expect(screen.getByTestId('signup-error-login')).toBeOnTheScreen();
    expect(screen.getByTestId('signup-error-reset')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('points an existing account to log in and reset password', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered', status: 422 },
    });
    await renderScreen(<SignupScreen />, { next: '/claim/acme' });
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));
    expect(await screen.findByText(signupErrorMessage('email_exists'))).toBeOnTheScreen();
    await user.press(screen.getByTestId('signup-error-login'));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/claim/acme' } });
    expect(screen.getByText(auth.resetYourPasswordLink.text)).toBeOnTheScreen();
    await user.press(screen.getByTestId('signup-error-reset'));
    expect(mockRouter.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('counts how many more password characters are needed while typing', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    expect(screen.getByText(signupPasswordHint(0))).toBeOnTheScreen();
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'short');
    expect(screen.getByText(signupPasswordHint(5))).toBeOnTheScreen();
    expect(signupPasswordHint(5)).toBe('5 more characters needed');
  });

  it('agrees to the Terms and Privacy Policy, which open the website in the in-app browser', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />);
    expect(screen.getByText('By creating an account, you agree to the Terms and Privacy Policy.')).toBeOnTheScreen();

    await user.press(screen.getByRole('link', { name: auth.terms.text }));
    await user.press(screen.getByRole('link', { name: auth.privacyPolicy.text }));
    expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'https://lawsuitai.org/terms');
    expect(openExternalUrl).toHaveBeenNthCalledWith(2, 'https://lawsuitai.org/privacy');
  });

  it('shows the beta bullets, or the fee-disclosure bullets when that flag is on, and links to log in', async () => {
    const user = userEvent.setup();
    await renderScreen(<SignupScreen />, { next: '/dashboard' });
    expect(screen.getByText(auth.bulletFreeForNow.text)).toBeOnTheScreen();
    expect(screen.queryByText(auth.bulletOfficialFilingFree.text)).toBeNull();
    await user.press(screen.getByRole('link', { name: common.logIn.text }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/dashboard' } });
  });

  it('keeps the fields editable while creating the account, so iOS does not offer to save the password early', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mockSignUp.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderScreen(<SignupScreen />);
    await fillForm(user);
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    expect(screen.getByRole('button', { name: auth.creatingAccount.text })).toBeDisabled();
    for (const label of [auth.fullNameLabel.text, auth.emailLabel.text, auth.passwordLabel.text]) {
      expect(screen.getByLabelText(label)).toHaveProp('editable', true);
    }
    await act(async () => answer({ data: { user: null, session: null }, error: { message: 'User already registered', status: 422 } }));
    expect(await screen.findByTestId('signup-error')).toBeOnTheScreen();
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('sends one sign-up when the keyboard submits again while the first is still running', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mockSignUp.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderScreen(<SignupScreen />);
    await fillForm(user);
    await fireEvent(screen.getByLabelText(auth.passwordLabel.text), 'submitEditing');
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: auth.creatingAccount.text })).toBeDisabled();

    // "Go" again on the password field, then the button: neither sends a second request.
    await fireEvent(screen.getByLabelText(auth.passwordLabel.text), 'submitEditing');
    await user.press(screen.getByRole('button', { name: auth.creatingAccount.text }));
    expect(mockSignUp).toHaveBeenCalledTimes(1);

    await act(async () => answer({ data: { user: { id: 'user-2' }, session: null }, error: null }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  it('shows the fee-disclosure bullet when FEE_DISCLOSURE_ENABLED is on', async () => {
    mockFlags.on = ['FEE_DISCLOSURE_ENABLED'];
    await renderScreen(<SignupScreen />);
    expect(screen.getByText(auth.bulletOfficialFilingFree.text)).toBeOnTheScreen();
    expect(screen.queryByText(auth.bulletFreeForNow.text)).toBeNull();
  });

  it.each(['loading', 'unavailable'])(
    'shows the fee-disclosure bullet, true either way, while the config is %s',
    async (status) => {
      mockFlags.status = status;
      await renderScreen(<SignupScreen />);
      expect(screen.getByText(auth.bulletOfficialFilingFree.text)).toBeOnTheScreen();
      expect(screen.queryByText(auth.bulletFreeForNow.text)).toBeNull();
    },
  );
});

describe('CheckEmailScreen', () => {
  it('names the email, says to come back and log in, and keeps the next path', async () => {
    const user = userEvent.setup();
    expect(checkEmailHref(' ana@example.com ', '/claim/acme')).toEqual({ pathname: '/check-email', params: { next: '/claim/acme' } });
    await renderScreen(<CheckEmailScreen />, { next: '/claim/acme' });

    expect(screen.getByRole('header', { name: auth.checkEmailTitle.text })).toBeOnTheScreen();
    expect(
      screen.getByText(`${auth.sentConfirmationTo.text} ana@example.com. ${auth.openItToVerify.text}`),
    ).toBeOnTheScreen();
    expect(screen.getByText(auth.backToApp.text)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/claim/acme' } });

    await user.press(screen.getByRole('link', { name: auth.tryDifferentEmail.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/signup', params: { next: '/claim/acme' } });
  });

  it('drops an unsafe next', async () => {
    const user = userEvent.setup();
    checkEmailHref('ana@example.com', null);
    await renderScreen(<CheckEmailScreen />, { next: 'https://evil.example' });
    await user.press(screen.getByRole('button', { name: common.logIn.text }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/login');
  });

  it('never prints text from the link that opened it (claimmatch://check-email?email=…)', async () => {
    const injected =
      'support@claimmatch-payouts.com. To release your payout, call (800) 555-0100 and read us your confirmation number';
    // Not an address: nothing to name, even after a sign-up in this session.
    expect(checkEmailHref(injected, null)).toBe('/check-email');
    await renderScreen(<CheckEmailScreen />, { email: injected });
    expect(screen.getByText(auth.openItToVerify.text)).toBeOnTheScreen();
    expect(screen.queryByText(/payout|555-0100/)).toBeNull();
    expect(screen.queryByText(new RegExp(auth.sentConfirmationTo.text))).toBeNull();
    expect(screen.queryByTestId('check-email-resend')).toBeNull();
  });

  it('resends the confirmation email and then waits before another send', async () => {
    const user = userEvent.setup();
    checkEmailHref('ana@example.com', null);
    await renderScreen(<CheckEmailScreen />);

    await user.press(screen.getByRole('button', { name: auth.resendConfirmation.text }));
    await waitFor(() =>
      expect(mockResend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'ana@example.com',
        options: { emailRedirectTo: 'https://lawsuitai.org/auth/callback' },
      }),
    );
    expect(await screen.findByText(SIGNUP_RESEND_SENT)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: auth.resendConfirmation.text })).toBeDisabled();
    expect(screen.getByText(/You can resend in \d+ seconds\./)).toBeOnTheScreen();
  });

  it('maps a rate limit from resend through the same signup error copy', async () => {
    const user = userEvent.setup();
    mockResend.mockResolvedValueOnce({ error: { message: 'email rate limit exceeded' } });
    checkEmailHref('ana@example.com', null);
    await renderScreen(<CheckEmailScreen />);
    await user.press(screen.getByRole('button', { name: auth.resendConfirmation.text }));
    expect(await screen.findByText(signupErrorMessage('rate_limited'))).toBeOnTheScreen();
    expect(screen.queryByText('email rate limit exceeded')).toBeNull();
  });
});

describe('signupAuthError', () => {
  it('maps provider text to the shared sentences and never returns the raw message', () => {
    expect(signupAuthError({ message: 'Email rate limit exceeded' })).toEqual({
      code: 'rate_limited',
      message: signupErrorMessage('rate_limited'),
    });
    expect(
      signupAuthError({
        message: 'For security purposes, you can only request this after 54 seconds.',
      }).code,
    ).toBe('rate_limited');
    expect(signupAuthError({ message: 'User already registered' }).code).toBe('email_exists');
    expect(signupAuthError({ message: 'weird provider text' }).message).toBe(signupErrorMessage('unknown'));
    expect(signupAuthError({ message: 'weird provider text' }).message).not.toBe('weird provider text');
  });
});
