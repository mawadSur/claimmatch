import { act, userEvent, waitFor } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import CheckEmailRoute from '@/app/(auth)/check-email';
import ForgotPasswordRoute from '@/app/(auth)/forgot-password';
import LoginRoute from '@/app/(auth)/login';
import SignupRoute from '@/app/(auth)/signup';
import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import { loginHref } from '@/features/shared';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ signInWithPassword: mockSignIn, signUp: mockSignUp, resetPasswordForEmail: jest.fn() }),
}));
jest.mock('@/providers/ConfigProvider', () => ({ useConfig: () => ({ isFlagOn: () => false }) }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getApi: () => ({ request: jest.fn(async () => ({ ok: true, status: 200, data: {} })) }),
}));

function page(name: string) {
  return function Page() {
    return <Text>{name}</Text>;
  };
}

// The real sign-in screens and their modal stack, over stand-ins for the rest of the app.
const tree = {
  _layout: { default: () => <Stack />, unstable_settings: { anchor: '(tabs)' } },
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/lawsuits/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/lawsuits/index': page('catalog'),
  '(tabs)/dashboard/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/dashboard/index': page('dashboard'),
  '(tabs)/settings/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/settings/index': page('settings'),
  '(auth)/_layout': AuthLayout,
  '(auth)/login': LoginRoute,
  '(auth)/signup': SignupRoute,
  '(auth)/check-email': CheckEmailRoute,
  '(auth)/forgot-password': ForgotPasswordRoute,
  'claim/[slug]': page('claim'),
};

type NavState = { routes: { name: string; state?: NavState }[] };

/** Route names in the root Stack (inside the router's own "__root" wrapper). */
function rootStackRoutes(state: unknown): string[] {
  const wrapper = state as NavState | undefined;
  return wrapper?.routes[0]?.state?.routes.map((route) => route.name) ?? [];
}

async function logIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(auth.emailLabel.text), 'ana@example.com');
  await user.type(screen.getByLabelText(auth.passwordLabel.text), 'correct horse');
  await user.press(screen.getByRole('button', { name: common.logIn.text }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ data: { user: { id: 'user-1' }, session: {} }, error: null });
  mockSignUp.mockResolvedValue({ data: { user: { id: 'user-1' }, session: null }, error: null });
});

describe('sign-in navigation', () => {
  it('closes the sign-in sheet back onto the claim the person came from', async () => {
    const result = await renderRouter(tree, { initialUrl: '/claim/acme' });
    await act(async () => router.push(loginHref('/claim/acme')));
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'claim/[slug]', '(auth)']);

    await logIn();

    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'claim/[slug]']));
    expect(result.getPathname()).toBe('/claim/acme');
  });

  it('closes onto Your claims when there is no next', async () => {
    const result = await renderRouter(tree, { initialUrl: '/settings' });
    await act(async () => router.push('/login'));

    await logIn();

    await waitFor(() => expect(result.getPathname()).toBe('/dashboard'));
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
  });

  it('returns from Check your email to the sign-up form as it was left', async () => {
    const user = userEvent.setup();
    await renderRouter(tree, { initialUrl: '/settings' });
    await act(async () => router.push('/signup'));

    await user.type(await screen.findByLabelText(auth.fullNameLabel.text), 'Ana Díaz');
    await user.type(screen.getByLabelText(auth.emailLabel.text), 'ana@exmaple.com');
    await user.type(screen.getByLabelText(auth.passwordLabel.text), 'long enough pw');
    await user.press(screen.getByRole('button', { name: auth.createMyAccount.text }));

    expect(await screen.findByText(new RegExp(`${auth.sentConfirmationTo.text} ana@exmaple.com`))).toBeOnTheScreen();
    await user.press(screen.getByRole('link', { name: auth.tryDifferentEmail.text }));

    const email = await screen.findByLabelText(auth.emailLabel.text);
    expect(email).toHaveDisplayValue('ana@exmaple.com');
    expect(screen.getByLabelText(auth.fullNameLabel.text)).toHaveDisplayValue('Ana Díaz');
  });

  it('switches between log in and sign up in place, keeping the next path', async () => {
    const user = userEvent.setup();
    const result = await renderRouter(tree, { initialUrl: '/claim/acme' });
    await act(async () => router.push(loginHref('/claim/acme')));
    // From a claim the sheet offers sign-up with one button (no second "Create an account" link).
    await user.press(await screen.findByRole('button', { name: shared.createFreeAccount.text }));

    expect(await screen.findByRole('button', { name: auth.createMyAccount.text })).toBeOnTheScreen();
    expect(result.getPathname()).toBe('/signup');
    expect(result.getSearchParams()).toEqual({ next: '/claim/acme' });
    // Replaced, not stacked: the sign-in sheet still holds one screen.
    const state = result.getRouterState() as NavState;
    const authStack = state.routes[0]?.state?.routes.find((route) => route.name === '(auth)');
    expect(authStack?.state?.routes.map((route) => route.name)).toEqual(['signup']);
  });
});
