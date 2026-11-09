import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContext, NavigationRouteContext } from 'expo-router/react-navigation';
import type { ComponentProps, ReactNode } from 'react';
import { Keyboard, ScrollView, type KeyboardEvent } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText, Button, Screen } from '@/components/ui';

/**
 * Settings > Your details and emails, tap a field, Back: Settings was left
 * scrolled under its large title. iOS runs a scroll view's keyboard handler
 * in every mounted screen and moves a resting scroll view to y 0, so only a
 * focused screen with text fields may adjust for the keyboard.
 */

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };
const KEYBOARD = { duration: 250, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 538, width: 402, height: 336 } };

type NavigationValue = NonNullable<ComponentProps<typeof NavigationContext.Provider>['value']>;

/** A screen's navigation object with focus and blur events the test can send. */
function fakeNavigation(initiallyFocused: boolean) {
  let focused = initiallyFocused;
  const listeners = new Map<string, Set<() => void>>();
  const navigation = {
    isFocused: () => focused,
    addListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
      return () => set.delete(listener);
    },
  };
  return {
    navigation: navigation as unknown as NavigationValue,
    async send(type: 'focus' | 'blur') {
      focused = type === 'focus';
      await act(async () => listeners.get(type)?.forEach((listener) => listener()));
    },
  };
}

type KeyboardListener = (event: KeyboardEvent) => void;
let keyboardListeners: Map<string, Set<KeyboardListener>>;

beforeEach(() => {
  keyboardListeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    const listeners = keyboardListeners.get(name) ?? new Set<KeyboardListener>();
    listeners.add(listener as KeyboardListener);
    keyboardListeners.set(name, listeners);
    return { remove: () => listeners.delete(listener as KeyboardListener) } as ReturnType<typeof Keyboard.addListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

async function keyboard(name: 'keyboardWillShow' | 'keyboardWillHide' | 'keyboardDidHide') {
  await act(async () => keyboardListeners.get(name)?.forEach((listener) => listener(KEYBOARD as unknown as KeyboardEvent)));
}

async function renderScreen(element: ReactNode, navigation?: NavigationValue) {
  const tree = <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>;
  await render(navigation ? <NavigationContext.Provider value={navigation}>{tree}</NavigationContext.Provider> : tree);
}

function adjustsForKeyboard(): boolean {
  return screen.getByTestId('screen-scroll').props.automaticallyAdjustKeyboardInsets === true;
}

describe('Screen and the keyboard', () => {
  it('never adjusts a screen without text fields for the keyboard, focused or not', async () => {
    await renderScreen(
      <Screen testID="screen">
        <AppText>Settings</AppText>
      </Screen>,
    );
    expect(adjustsForKeyboard()).toBe(false);
    await keyboard('keyboardWillShow');
    expect(adjustsForKeyboard()).toBe(false);
  });

  it('adjusts a focused screen with text fields, and stops when another screen covers it', async () => {
    const { navigation, send } = fakeNavigation(true);
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Your details and emails</AppText>
      </Screen>,
      navigation,
    );
    expect(adjustsForKeyboard()).toBe(true);

    // The log-in sheet opens over it: its keyboard must not move this screen.
    await send('blur');
    expect(adjustsForKeyboard()).toBe(false);
    await keyboard('keyboardWillShow');
    expect(adjustsForKeyboard()).toBe(false);
    await keyboard('keyboardDidHide');

    await send('focus');
    expect(adjustsForKeyboard()).toBe(true);
  });

  it('keeps adjusting a screen that loses focus with its keyboard open, until that keyboard has closed', async () => {
    const { navigation, send } = fakeNavigation(true);
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Search</AppText>
      </Screen>,
      navigation,
    );
    await keyboard('keyboardWillShow');
    await send('blur');
    // Still on, so the keyboard's bottom inset is removed when it closes.
    expect(adjustsForKeyboard()).toBe(true);
    await keyboard('keyboardDidHide');
    expect(adjustsForKeyboard()).toBe(false);
  });

  it('reads the focus when it subscribes, so a screen that mounts under another one starts unfocused', async () => {
    const { navigation } = fakeNavigation(false);
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Settlements</AppText>
      </Screen>,
      navigation,
    );
    expect(adjustsForKeyboard()).toBe(false);
  });

  it('leaves a screen with a footer to its own keyboard padding', async () => {
    await renderScreen(
      <Screen hasTextFields footer={<Button label="Delete" onPress={jest.fn()} />} testID="screen">
        <AppText>Type DELETE to confirm.</AppText>
      </Screen>,
    );
    expect(adjustsForKeyboard()).toBe(false);
  });
});

/**
 * The keyboard handler scrolls through React Native's scrollTo, which keeps
 * the offset at 0 or more: a view resting under its header (a negative
 * offset) jumped under it, and a large title collapsed. Tab roots shown
 * after signing in or out rested under the small title.
 */
describe('Screen under its header', () => {
  /** The scroll view's scrollTo (React Native's Jest mock shares it across instances). */
  const scrollTo = (ScrollView as unknown as { prototype: { scrollTo: jest.Mock } }).prototype.scrollTo;

  beforeEach(() => scrollTo.mockClear());

  /** A scroll event as iOS sends it; the content is taller than the view unless `contentHeight` says otherwise. */
  async function scrollEvent(y: number, contentHeight = 2000) {
    await fireEvent.scroll(screen.getByTestId('screen-scroll'), {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 402, height: contentHeight },
        layoutMeasurement: { width: 402, height: 812 },
      },
    });
  }

  function overflowEnabled(): boolean {
    return screen.getByTestId('screen-scroll').props.scrollToOverflowEnabled === true;
  }

  async function renderTabRoot(routeKey: string, restKey: string) {
    await renderScreen(
      <NavigationRouteContext.Provider value={{ key: routeKey, name: 'index' } as never}>
        <Screen restKey={restKey} testID="screen">
          <AppText>Settings</AppText>
        </Screen>
      </NavigationRouteContext.Provider>,
    );
  }

  it('lifts the scrollTo limit only while the content sits above 0, under the header', async () => {
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Search</AppText>
      </Screen>,
    );
    // Content laid out before the first offset arrives: still resting under the header.
    await fireEvent(screen.getByTestId('screen-scroll'), 'contentSizeChange', 402, 2000);
    expect(overflowEnabled()).toBe(true);
    await scrollEvent(-168);
    expect(overflowEnabled()).toBe(true);
    // Scrolled into the content: the limit is back, so a view the keyboard lifted past its end settles back.
    await scrollEvent(240);
    expect(overflowEnabled()).toBe(false);
    await scrollEvent(-12);
    expect(overflowEnabled()).toBe(true);
  });

  it('keeps the limit off for content shorter than the view, and returns it to where it was when the keyboard closes', async () => {
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Forgot your password?</AppText>
      </Screen>,
    );
    await scrollEvent(-54, 635);
    await keyboard('keyboardWillShow');
    // The keyboard lifted the email field past 0: the limit would pin the view at 0, under the header.
    await scrollEvent(24, 635);
    expect(overflowEnabled()).toBe(true);
    await keyboard('keyboardWillHide');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -54, animated: true });
  });

  it('leaves a long view where the keyboard left it', async () => {
    await renderScreen(
      <Screen hasTextFields testID="screen">
        <AppText>Your details and emails</AppText>
      </Screen>,
    );
    await scrollEvent(-116);
    await keyboard('keyboardWillShow');
    await scrollEvent(260);
    await keyboard('keyboardWillHide');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('moves a tab root shown after signing out to where the first one rested, again after iOS shifts it', async () => {
    await renderTabRoot('settings-index-1', 'signedIn');
    // Where iOS first places it: under the open large title.
    await scrollEvent(-168);
    await scrollEvent(400);
    expect(scrollTo).not.toHaveBeenCalled();
    await screen.unmount();

    // Signed out: a new scroll view, placed under the small title.
    await renderTabRoot('settings-index-1', 'signedOut');
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
    // Opening the large title moves the offset once more.
    await scrollEvent(-220);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: -168, animated: false });
    await scrollEvent(-168);
    await scrollEvent(-220);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('leaves a tab root where iOS put it when the auth status did not change, and stops for a drag', async () => {
    await renderTabRoot('dashboard-index-1', 'signedIn');
    await scrollEvent(-168);
    await screen.unmount();

    // The list replaces the skeleton for the same person.
    await renderTabRoot('dashboard-index-1', 'signedIn');
    await scrollEvent(-116);
    expect(scrollTo).not.toHaveBeenCalled();
    await screen.unmount();

    await renderTabRoot('dashboard-index-1', 'signedOut');
    await scrollEvent(-116);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Pull to refresh right away: the person's drag is never undone.
    await fireEvent(screen.getByTestId('screen-scroll'), 'scrollBeginDrag');
    await scrollEvent(-260);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('never moves a screen without a restKey', async () => {
    await renderScreen(
      <NavigationRouteContext.Provider value={{ key: 'claim-1', name: 'claim/[slug]' } as never}>
        <Screen testID="screen">
          <AppText>Claim</AppText>
        </Screen>
      </NavigationRouteContext.Provider>,
    );
    await scrollEvent(-116);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
