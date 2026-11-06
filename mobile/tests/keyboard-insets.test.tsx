import { act, render, screen } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type { ComponentProps, ReactNode } from 'react';
import { Keyboard, type KeyboardEvent } from 'react-native';
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

let keyboardListeners: Map<string, (event: KeyboardEvent) => void>;

beforeEach(() => {
  keyboardListeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    keyboardListeners.set(name, listener as (event: KeyboardEvent) => void);
    return { remove: () => keyboardListeners.delete(name) } as ReturnType<typeof Keyboard.addListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

async function keyboard(name: 'keyboardWillShow' | 'keyboardDidHide') {
  await act(async () => keyboardListeners.get(name)?.(KEYBOARD as unknown as KeyboardEvent));
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
