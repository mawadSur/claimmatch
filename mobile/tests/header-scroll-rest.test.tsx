import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import { Dimensions, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText, Screen } from '@/components/ui';

/**
 * Where a tab root rests after signing in or out (useHeaderScroll's restKey):
 * the route keeps the latest auth status of its views, also of views that
 * never appeared, and a rest offset per text size. Each test uses its own
 * route: the hook keeps routes for the app's lifetime.
 */

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

/** The scroll view's scrollTo (React Native's Jest mock shares it across instances). */
const scrollTo = (ScrollView as unknown as { prototype: { scrollTo: jest.Mock } }).prototype.scrollTo;

/** The text size, as iOS reports it (1 is the default size). */
function setFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale });
}

beforeEach(() => {
  scrollTo.mockClear();
  setFontScale(1);
});

afterEach(() => jest.restoreAllMocks());

/** A tab root's screen, as Settings and Your claims show it for this auth status. */
function tabRoot(routeKey: string, restKey: string) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationRouteContext.Provider value={{ key: routeKey, name: 'index' } as never}>
        <Screen restKey={restKey} testID="screen">
          <AppText>{restKey}</AppText>
        </Screen>
      </NavigationRouteContext.Provider>
    </SafeAreaProvider>
  );
}

/** A scroll event as iOS sends it, for content taller than the view. */
async function scrollEvent(y: number) {
  await fireEvent.scroll(screen.getByTestId('screen-scroll'), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 402, height: 2000 },
      layoutMeasurement: { width: 402, height: 812 },
    },
  });
}

describe('a tab root replaced while its tab is off screen', () => {
  it('still moves the view shown next to its rest after two replacements that never scrolled', async () => {
    // Your claims, signed in: placed under the open large title, then scrolled.
    await render(tabRoot('dashboard-index-twice', 'signedIn'));
    await scrollEvent(-168);
    await scrollEvent(400);
    await screen.unmount();

    // Signed out on the Settings tab, then signed in again: two new views that never appear or scroll.
    await render(tabRoot('dashboard-index-twice', 'signedOut'));
    await screen.unmount();
    await render(tabRoot('dashboard-index-twice', 'signedIn'));
    expect(scrollTo).not.toHaveBeenCalled();

    // Back on Your claims: iOS shows the newest view under the small title.
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
  });

  it('counts the key changes of a view that stays mounted after it was placed', async () => {
    await render(tabRoot('settings-index-rekeyed', 'signedIn'));
    await scrollEvent(-168);
    await scrollEvent(400);
    // The same view shown signed out, then signed in again, with no new first offset.
    await screen.rerender(tabRoot('settings-index-rekeyed', 'signedOut'));
    await screen.rerender(tabRoot('settings-index-rekeyed', 'signedIn'));
    await screen.unmount();

    await render(tabRoot('settings-index-rekeyed', 'signedIn'));
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
  });

  it('leaves the next view where iOS put it when every replacement kept the key', async () => {
    await render(tabRoot('dashboard-index-same', 'signedIn'));
    await scrollEvent(-168);
    await screen.unmount();
    await render(tabRoot('dashboard-index-same', 'signedIn'));
    await screen.unmount();
    await render(tabRoot('dashboard-index-same', 'signedIn'));
    await scrollEvent(-116);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('the rest after a Dynamic Type change', () => {
  it('keeps the rest of each text size apart, so the larger size’s rest never moves a view past its own', async () => {
    await render(tabRoot('settings-index-sizes', 'signedIn'));
    await scrollEvent(-168);
    await screen.unmount();

    // An accessibility text size, where this header's large title is taller: signed out with the title open.
    setFontScale(2.353);
    await render(tabRoot('settings-index-sizes', 'signedOut'));
    await scrollEvent(-220);
    expect(scrollTo).not.toHaveBeenCalled();
    await screen.unmount();

    // Back to the default size, then signed in under the small title: to the default size's rest, not -220,
    // which would leave a 52 pt gap above the content.
    setFontScale(1);
    await render(tabRoot('settings-index-sizes', 'signedIn'));
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
  });

  it('uses the rest from another text size while the rest has not been seen to change with it', async () => {
    // The app's headers keep their font size, so the rest measured at an accessibility size holds at the default one.
    setFontScale(2.353);
    await render(tabRoot('dashboard-index-fixed-title', 'signedIn'));
    await scrollEvent(-168);
    await scrollEvent(400);
    await screen.unmount();

    setFontScale(1);
    await render(tabRoot('dashboard-index-fixed-title', 'signedOut'));
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
  });

  it('leaves a view under the small title at a size not measured yet, once the rest has changed with the text', async () => {
    await render(tabRoot('settings-index-unmeasured', 'signedIn'));
    await scrollEvent(-168);
    await screen.unmount();
    setFontScale(2.353);
    await render(tabRoot('settings-index-unmeasured', 'signedOut'));
    await scrollEvent(-220);
    await screen.unmount();

    // A third size: neither -168 nor -220 is known to be its rest.
    setFontScale(1.235);
    await render(tabRoot('settings-index-unmeasured', 'signedIn'));
    await scrollEvent(-116);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('moves views to the larger rest once the text grows', async () => {
    await render(tabRoot('dashboard-index-text-size', 'signedIn'));
    await scrollEvent(-168);
    await screen.unmount();

    setFontScale(2.353);
    await render(tabRoot('dashboard-index-text-size', 'signedOut'));
    await scrollEvent(-220);
    expect(scrollTo).not.toHaveBeenCalled();
    await screen.unmount();

    await render(tabRoot('dashboard-index-text-size', 'signedIn'));
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -220, animated: false });
  });
});
