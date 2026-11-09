import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';

import { useReducedMotion } from './use-reduced-motion';

export interface KeyboardOverlap {
  /** True while the software keyboard is shown. */
  visible: boolean;
  /**
   * How far the keyboard reaches above the bottom of the window, in points.
   * iOS only: Android resizes the window for the keyboard (Expo's default
   * softwareKeyboardLayoutMode "resize"), so this stays 0 there.
   */
  height: number;
}

const HIDDEN: KeyboardOverlap = { visible: false, height: 0 };

/**
 * How far the keyboard covers a view whose bottom edge is `viewBottom` points
 * from the top of the screen, never negative. Both are in screen coordinates,
 * as the keyboard events report the keyboard's top edge.
 */
export function overlapWithKeyboard(viewBottom: number, keyboardTop: number): number {
  return Math.max(0, Math.round(viewBottom - keyboardTop));
}

/**
 * Tracks the software keyboard for a view that reaches the bottom of the
 * window: a screen outside the tab bar, pushed or in a sheet modal. The view
 * is not measured, because inside a sheet measureInWindow counts from the
 * sheet's top, not the screen's: a footer was lifted short by the sheet's
 * offset (62 pt on an iPhone 17) and stayed behind the keyboard. Changes
 * follow the keyboard's own animation, or jump when the user asked to reduce
 * motion.
 */
export function useKeyboardOverlap(enabled: boolean): KeyboardOverlap {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<KeyboardOverlap>(HIDDEN);

  useEffect(() => {
    if (!enabled) return;
    const ios = Platform.OS === 'ios';

    const followKeyboard = (event: KeyboardEvent) => {
      if (!ios || reduceMotion || !event.duration) return;
      LayoutAnimation.configureNext({
        duration: event.duration,
        update: { duration: event.duration, type: LayoutAnimation.Types.keyboard },
      });
    };

    const show = (event: KeyboardEvent) => {
      const height = ios ? overlapWithKeyboard(Dimensions.get('window').height, event.endCoordinates.screenY) : 0;
      followKeyboard(event);
      setState({ visible: true, height });
    };

    const hide = (event: KeyboardEvent) => {
      followKeyboard(event);
      setState(HIDDEN);
    };

    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', show),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', hide),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [enabled, reduceMotion]);

  return enabled ? state : HIDDEN;
}
