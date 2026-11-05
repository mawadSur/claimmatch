import { userEvent, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import NotFound from '@/app/+not-found';
import { unstable_settings as rootSettings } from '@/app/_layout';
import Index from '@/app/index';
import { app } from '@/copy/app';

function page(name: string) {
  return function Page() {
    return <Text>{name}</Text>;
  };
}

// The real "/" and not-found routes and root anchor, with stand-ins for the other screens.
const tree = {
  _layout: { default: () => <Stack />, unstable_settings: rootSettings },
  index: Index,
  '+not-found': NotFound,
  '(tabs)/_layout': () => <Stack />,
  '(tabs)/lawsuits/_layout': { default: () => <Stack />, unstable_settings: { anchor: 'index' } },
  '(tabs)/lawsuits/index': page('catalog'),
  '(tabs)/lawsuits/[slug]': page('settlement'),
  'claim/[slug]': page('claim'),
};

type NavState = { routes: { name: string; state?: NavState }[] };

/** Route names in the root Stack (inside the router's own "__root" wrapper). */
function rootStackRoutes(state: unknown): string[] {
  const wrapper = state as NavState | undefined;
  return wrapper?.routes[0]?.state?.routes.map((route) => route.name) ?? [];
}

describe('navigation', () => {
  it('opens / on the catalog with a single tab navigator and nothing to go back to', async () => {
    const result = await renderRouter(tree, { initialUrl: '/' });
    expect(await screen.findByText('catalog')).toBeOnTheScreen();
    expect(result.getPathname()).toBe('/lawsuits');
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']);
    expect(testRouter.canGoBack()).toBe(false);
  });

  it('keeps the tabs under a deep-linked claim, so back leads to the catalog', async () => {
    const result = await renderRouter(tree, { initialUrl: '/claim/example-settlement' });
    expect(await screen.findByText('claim')).toBeOnTheScreen();
    expect(testRouter.canGoBack()).toBe(true);
    await testRouter.back();
    expect(result.getPathname()).toBe('/lawsuits');
  });

  it('returns from an unknown link to the existing tabs instead of stacking a second copy', async () => {
    const user = userEvent.setup();
    const result = await renderRouter(tree, { initialUrl: '/does-not-exist' });
    expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)', '+not-found']);

    await user.press(await screen.findByRole('button', { name: app.browseOpenSettlements.text }));

    await waitFor(() => expect(rootStackRoutes(result.getRouterState())).toEqual(['(tabs)']));
    expect(result.getPathname()).toBe('/lawsuits');
    expect(testRouter.canGoBack()).toBe(false);
  });
});
