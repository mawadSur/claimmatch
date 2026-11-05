import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { fetchProfile } from '@/data/profile';
import { useOnboardingGate } from '@/features/onboarding/gate';

// A tiny auth store, so a test can sign in and out while the app is mounted.
const mockAuthStore = {
  value: { status: 'signedOut', user: null as { id: string } | null },
  listeners: new Set<() => void>(),
  set(status: string, user: { id: string } | null) {
    this.value = { status, user };
    this.listeners.forEach((listener) => listener());
  },
};
jest.mock('@/providers/AuthProvider', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    useAuth: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockAuthStore.listeners.add(listener);
          return () => mockAuthStore.listeners.delete(listener);
        },
        () => mockAuthStore.value,
      ),
  };
});

jest.mock('@/data/profile', () => ({ fetchProfile: jest.fn() }));
const mockFetchProfile = fetchProfile as jest.Mock;

function page(name: string) {
  return function Page() {
    return <Text>{name}</Text>;
  };
}

function RootLayout() {
  useOnboardingGate();
  return <Stack />;
}

const tree = {
  _layout: { default: RootLayout, unstable_settings: { anchor: '(tabs)' } },
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/lawsuits/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/lawsuits/index': page('catalog'),
  '(tabs)/dashboard/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/dashboard/index': page('dashboard'),
  '(auth)/_layout': () => <Stack />,
  '(auth)/login': page('login'),
  'claim/[slug]': page('claim'),
  onboarding: page('onboarding'),
};

type NavState = { routes: { name: string; state?: NavState }[] };

function rootStackRoutes(state: unknown): string[] {
  const wrapper = state as NavState | undefined;
  return wrapper?.routes[0]?.state?.routes.map((route) => route.name) ?? [];
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function profile(onboarded: boolean) {
  return { onboarded, full_name: null, state: null, attributes: {} };
}

async function signIn() {
  await act(async () => mockAuthStore.set('signedIn', { id: 'user-1' }));
}

async function signOut() {
  await act(async () => mockAuthStore.set('signedOut', null));
  client.removeQueries({ queryKey: ['profile'] });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockAuthStore.value = { status: 'signedOut', user: null };
  mockFetchProfile.mockResolvedValue(profile(false));
});

afterEach(() => client.clear());

describe('onboarding gate', () => {
  it('opens onboarding once after a sign-in while the profile is not onboarded', async () => {
    const result = await renderRouter(tree, { initialUrl: '/lawsuits', wrapper });
    await signIn();

    expect(await screen.findByText('onboarding')).toBeOnTheScreen();
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'onboarding']);
    expect(mockFetchProfile).toHaveBeenCalledWith('user-1', expect.anything());

    // Closed without finishing: it does not come back in this session.
    await act(async () => router.back());
    await act(async () => router.navigate('/dashboard'));
    await waitFor(() => expect(result.getPathname()).toBe('/dashboard'));
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
  });

  it('asks again after signing out and back in', async () => {
    const result = await renderRouter(tree, { initialUrl: '/lawsuits', wrapper });
    await signIn();
    expect(await screen.findByText('onboarding')).toBeOnTheScreen();
    await act(async () => router.back());
    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']));

    await signOut();
    await signIn();

    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'onboarding']));
  });

  it('leaves a session restored at launch to "Finish your profile"', async () => {
    mockAuthStore.value = { status: 'signedIn', user: { id: 'user-1' } };
    const result = await renderRouter(tree, { initialUrl: '/lawsuits', wrapper });
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    await act(async () => undefined);
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
  });

  it('does nothing for an onboarded profile', async () => {
    mockFetchProfile.mockResolvedValue(profile(true));
    const result = await renderRouter(tree, { initialUrl: '/lawsuits', wrapper });
    await signIn();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    await act(async () => undefined);
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
  });

  it('does nothing while signed out, and reads no profile', async () => {
    const result = await renderRouter(tree, { initialUrl: '/lawsuits', wrapper });
    await act(async () => undefined);
    expect(mockFetchProfile).not.toHaveBeenCalled();
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
  });

  it('carries the claim the person is on as next', async () => {
    const result = await renderRouter(tree, { initialUrl: '/claim/acme', wrapper });
    await signIn();
    await waitFor(() => expect(result.getPathname()).toBe('/onboarding'));
    expect(result.getSearchParams()).toEqual({ next: '/claim/acme' });
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'claim/[slug]', 'onboarding']);
  });

  it('waits for the sign-in sheet to close before opening', async () => {
    let resolveProfile: (value: unknown) => void = () => undefined;
    mockFetchProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const result = await renderRouter(tree, { initialUrl: '/login', wrapper });
    await signIn();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    await act(async () => resolveProfile(profile(false)));
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', '(auth)']);

    await act(async () => router.dismissTo('/dashboard'));
    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'onboarding']));
  });
});
