import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { auth, passwordTooShortText } from '@/copy/auth';
import { AuthCallbackScreen, ConfirmEmailScreen } from '@/features/auth/EmailLinkScreens';
import { parseAuthCode, parseConfirmType, parseTokenHash } from '@/features/auth/email-links';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));

const mockAuthState = { status: 'signedIn' };
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuthState }));

const mockSupabaseAuth = {
  verifyOtp: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  updateUser: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: mockSupabaseAuth }) }));

const mockRequest = jest.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({ request: mockRequest }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

async function renderScreen(element: React.ReactElement, params: Record<string, string> = {}) {
  mockParams.current = params;
  await render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

const TOKEN = 'pkce_0123456789abcdef';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.status = 'signedIn';
});

describe('email link checks (src/lib/auth-confirm.ts)', () => {
  it('accepts only the known types and url-safe tokens', () => {
    expect(parseConfirmType('recovery')).toBe('recovery');
    expect(parseConfirmType('signup')).toBe('signup');
    expect(parseConfirmType('magiclink')).toBeNull();
    expect(parseConfirmType(['signup'])).toBeNull();
    expect(parseTokenHash(TOKEN)).toBe(TOKEN);
    expect(parseTokenHash('short')).toBeNull();
    expect(parseTokenHash('has spaces in it')).toBeNull();
    expect(parseAuthCode('0b8f3c1e-5a6d-4c2b-9e7f-1a2b3c4d5e6f')).not.toBeNull();
    expect(parseAuthCode('<script>')).toBeNull();
  });
});

describe('ConfirmEmailScreen (/auth/confirm)', () => {
  it('says an incomplete link is incomplete and changes nothing', async () => {
    const user = userEvent.setup();
    await renderScreen(<ConfirmEmailScreen />, { type: 'recovery' });
    expect(screen.getByRole('header', { name: auth.linkIncompleteTitle.text })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: auth.requestNewResetLink.text }));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/forgot-password');
    expect(mockSupabaseAuth.verifyOtp).not.toHaveBeenCalled();
  });

  it('uses the token only on the button press, then opens Choose a new password', async () => {
    const user = userEvent.setup();
    mockSupabaseAuth.verifyOtp.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    await renderScreen(<ConfirmEmailScreen />, { token_hash: TOKEN, type: 'recovery' });
    expect(mockSupabaseAuth.verifyOtp).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: auth.continueToReset.text }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/reset-password'));
    expect(mockSupabaseAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'recovery' });
    expect(mockRequest).toHaveBeenCalledWith('/api/session-flags', { method: 'POST' });
  });

  it('continues a confirmed sign-up to onboarding, or to the checked next', async () => {
    const user = userEvent.setup();
    mockSupabaseAuth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    await renderScreen(<ConfirmEmailScreen />, { token_hash: TOKEN, type: 'signup', next: '/claim/acme' });
    await user.press(screen.getByRole('button', { name: auth.confirmMyEmail.text }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/claim/acme'));
  });

  it('sends an expired link to the right screen', async () => {
    const user = userEvent.setup();
    mockSupabaseAuth.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    await renderScreen(<ConfirmEmailScreen />, { token_hash: TOKEN, type: 'signup' });
    await user.press(screen.getByRole('button', { name: auth.confirmMyEmail.text }));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/login', params: { link: 'expired' } }),
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('AuthCallbackScreen (/auth/callback)', () => {
  it('starts the session from the code, then opens onboarding with "Email confirmed."', async () => {
    mockSupabaseAuth.exchangeCodeForSession.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    await renderScreen(<AuthCallbackScreen />, { code: '0b8f3c1e-5a6d-4c2b-9e7f-1a2b3c4d5e6f' });
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/onboarding', params: { confirmed: '1' } }),
    );
    expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('sends the person to log in when the code cannot start a session here (no verifier)', async () => {
    mockSupabaseAuth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: { message: 'code verifier missing' } });
    await renderScreen(<AuthCallbackScreen />, { code: '0b8f3c1e-5a6d-4c2b-9e7f-1a2b3c4d5e6f', next: '/claim/acme' });
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/login',
        params: { confirmed: '1', next: '/claim/acme' },
      }),
    );
  });

  it('reports an error link as expired', async () => {
    await renderScreen(<AuthCallbackScreen />, { error: 'access_denied', error_code: 'otp_expired' });
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/login', params: { link: 'expired' } }),
    );
    expect(mockSupabaseAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordScreen (/reset-password)', () => {
  it('checks the length and the match under each field before saving', async () => {
    const user = userEvent.setup();
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), 'short');
    await user.press(screen.getByRole('button', { name: auth.saveNewPassword.text }));
    expect(screen.getByText(passwordTooShortText(10))).toBeOnTheScreen();

    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), ' enough now');
    await user.type(screen.getByLabelText(auth.confirmPasswordLabel.text), 'something else');
    await user.press(screen.getByRole('button', { name: auth.saveNewPassword.text }));
    expect(screen.getByText(auth.passwordsDontMatch.text)).toBeOnTheScreen();
    expect(mockSupabaseAuth.updateUser).not.toHaveBeenCalled();
  });

  it('saves the new password, then shows Your claims with the web\'s "password updated" banner', async () => {
    const user = userEvent.setup();
    mockSupabaseAuth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), 'a long new password');
    await user.type(screen.getByLabelText(auth.confirmPasswordLabel.text), 'a long new password');
    await user.press(screen.getByRole('button', { name: auth.saveNewPassword.text }));

    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/dashboard', params: { password: 'updated' } }),
    );
    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({ password: 'a long new password' });
  });

  it('shows the web message when the update fails', async () => {
    const user = userEvent.setup();
    mockSupabaseAuth.updateUser.mockResolvedValueOnce({ data: {}, error: { message: 'session missing' } });
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), 'a long new password');
    await user.type(screen.getByLabelText(auth.confirmPasswordLabel.text), 'a long new password');
    await user.press(screen.getByRole('button', { name: auth.saveNewPassword.text }));
    expect(await screen.findByText(auth.updatePasswordFailed.text)).toBeOnTheScreen();
  });

  it('keeps both fields editable while saving, so iOS does not offer to save a password the server may refuse', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mockSupabaseAuth.updateUser.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), 'a long new password');
    await user.type(screen.getByLabelText(auth.confirmPasswordLabel.text), 'a long new password');
    await user.press(screen.getByRole('button', { name: auth.saveNewPassword.text }));

    expect(screen.getByRole('button', { name: auth.saveNewPassword.text })).toBeDisabled();
    expect(screen.getByLabelText(auth.newPasswordLabel.text)).toHaveProp('editable', true);
    expect(screen.getByLabelText(auth.confirmPasswordLabel.text)).toHaveProp('editable', true);
    await act(async () => answer({ data: {}, error: { message: 'session missing' } }));
    expect(await screen.findByText(auth.updatePasswordFailed.text)).toBeOnTheScreen();
  });

  it('saves once when the keyboard submits again while the first save is still running', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mockSupabaseAuth.updateUser.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderScreen(<ResetPasswordScreen />);
    await user.type(screen.getByLabelText(auth.newPasswordLabel.text), 'a long new password');
    await user.type(screen.getByLabelText(auth.confirmPasswordLabel.text), 'a long new password');
    await fireEvent(screen.getByLabelText(auth.confirmPasswordLabel.text), 'submitEditing');
    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: auth.saveNewPassword.text })).toBeDisabled();

    // "Done" again on the last field while the first save runs: no second request.
    await fireEvent(screen.getByLabelText(auth.confirmPasswordLabel.text), 'submitEditing');
    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledTimes(1);

    await act(async () => answer({ data: {}, error: null }));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/dashboard', params: { password: 'updated' } }),
    );
    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-out visitor to request a new link', async () => {
    mockAuthState.status = 'signedOut';
    await renderScreen(<ResetPasswordScreen />);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/forgot-password', params: { link: 'expired' } }),
    );
  });
});
