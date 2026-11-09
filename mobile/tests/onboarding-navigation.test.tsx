import { act, userEvent, waitFor } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import OnboardingRoute from '@/app/onboarding';
import { onboarding } from '@/copy/onboarding';

jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: 'user-1', email: 'ana@example.com' } }),
}));

const mockSave = jest.fn(async () => undefined);
jest.mock('@/data/profile', () => ({
  useProfile: () => ({
    isPending: false,
    isError: false,
    data: { full_name: 'Ana', state: 'CA', attributes: {}, onboarded: false },
  }),
  useSaveSettings: () => ({ mutateAsync: mockSave }),
}));

function page(name: string) {
  return function Page() {
    const params = useLocalSearchParams();
    return <Text>{`${name} ${JSON.stringify(params)}`}</Text>;
  };
}

const tree = {
  _layout: { default: () => <Stack />, unstable_settings: { anchor: '(tabs)' } },
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/lawsuits/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/lawsuits/index': page('catalog'),
  '(tabs)/dashboard/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/dashboard/index': page('dashboard'),
  'claim/[slug]': page('claim'),
  onboarding: OnboardingRoute,
};

type NavState = { routes: { name: string; state?: NavState }[] };

function rootStackRoutes(state: unknown): string[] {
  const wrapper = state as NavState | undefined;
  return wrapper?.routes[0]?.state?.routes.map((route) => route.name) ?? [];
}

beforeEach(() => mockSave.mockClear());

describe('finishing onboarding', () => {
  it('closes the modal onto Your claims with the welcome card', async () => {
    const user = userEvent.setup();
    const result = await renderRouter(tree, { initialUrl: '/lawsuits' });
    await act(async () => router.push('/onboarding'));

    await user.press(await screen.findByRole('button', { name: onboarding.skipForNow.text }));

    await waitFor(() => expect(result.getPathname()).toBe('/dashboard'));
    expect(screen.getByText('dashboard {"welcome":"1"}')).toBeOnTheScreen();
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
    expect(mockSave).toHaveBeenCalledWith({ onboarded: true });
  });

  it('returns to the claim it was opened over', async () => {
    const user = userEvent.setup();
    const result = await renderRouter(tree, { initialUrl: '/claim/acme' });
    await act(async () => router.push({ pathname: '/onboarding', params: { next: '/claim/acme' } }));

    await user.press(await screen.findByRole('button', { name: onboarding.continue.text }));
    await user.press(screen.getByRole('button', { name: onboarding.saveAndContinue.text }));

    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', 'claim/[slug]']));
    expect(result.getPathname()).toBe('/claim/acme');
  });
});
