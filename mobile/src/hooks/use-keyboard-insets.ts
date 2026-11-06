import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ContextType } from 'react';
import { Keyboard, Platform } from 'react-native';

type ScreenNavigation = NonNullable<ContextType<typeof NavigationContext>>;

interface FocusStore {
  get(): boolean;
  subscribe(onChange: () => void): () => void;
}

/**
 * The screen's focus as a store: read from the navigation object when React
 * subscribes, not during render (where it can be stale), then kept current
 * by the focus and blur events. Without a navigation object it stays focused.
 */
function focusStore(navigation: ScreenNavigation | undefined): FocusStore {
  let focused = true;
  return {
    get: () => focused,
    subscribe(onChange) {
      if (!navigation) return () => undefined;
      const update = (next: boolean) => {
        if (next === focused) return;
        focused = next;
        onChange();
      };
      update(navigation.isFocused());
      const unsubscribeFocus = navigation.addListener('focus', () => update(true));
      const unsubscribeBlur = navigation.addListener('blur', () => update(false));
      return () => {
        unsubscribeFocus();
        unsubscribeBlur();
      };
    },
  };
}

/**
 * Whether the screen around the caller is focused. A screen under a pushed
 * screen, a sheet or another tab is not. Outside a navigator (a unit test) it
 * counts as focused, where expo-router's useIsFocused would throw.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const store = useMemo(() => focusStore(navigation), [navigation]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * The value for a scroll view's `automaticallyAdjustKeyboardInsets`. `enabled`
 * says the scroll view holds text fields; it then follows the keyboard only
 * while its screen is focused, and until a keyboard that opened while it was
 * focused has closed (so that keyboard's bottom inset is removed again).
 *
 * iOS runs that native handler in every mounted scroll view that has the prop,
 * whichever screen opened the keyboard. It also scrolls such a scroll view to
 * y 0, which for one resting under a large title or a see-through header
 * means scrolled under it with the title collapsed. So screens without fields
 * never set the prop, and hidden screens drop it.
 */
export function useKeyboardInsetsActive(enabled: boolean): boolean {
  const focused = useScreenFocused();
  const [keyboardOpenedHere, setKeyboardOpenedHere] = useState(false);
  const focusedNow = useRef(focused);

  useEffect(() => {
    focusedNow.current = focused;
  }, [focused]);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') return undefined;
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', () => {
        if (focusedNow.current) setKeyboardOpenedHere(true);
      }),
      Keyboard.addListener('keyboardDidHide', () => setKeyboardOpenedHere(false)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [enabled]);

  return enabled && (focused || keyboardOpenedHere);
}
