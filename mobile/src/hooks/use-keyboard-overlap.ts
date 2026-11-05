import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, type HostInstance, type KeyboardEvent } from 'react-native';

import { useReducedMotion } from './use-reduced-motion';

export interface KeyboardOverlap {
  /** True while the software keyboard is shown. */
  visible: boolean;
  /**
   * How far the keyboard covers the target view from below, in points. iOS
   * only: Android resizes the window for the keyboard (Expo's default
   * softwareKeyboardLayoutMode "resize"), so this stays 0 there.
   */
  height: number;
}

const HIDDEN: KeyboardOverlap = { visible: false, height: 0 };

/** How far a view (frame in window coordinates) reaches below the keyboard's top edge, never negative. */
export function overlapWithKeyboard(frame: { y: number; height: number }, keyboardTop: number): number {
  return Math.max(0, Math.round(frame.y + frame.height - keyboardTop));
}

/**
 * Tracks the software keyboard against `target`. The view is measured in
 * window coordinates, so the result is right under a native header and in a
 * sheet modal alike (RN's KeyboardAvoidingView measures against its parent
 * instead). Changes follow the keyboard's own animation, or jump when the user
 * asked to reduce motion.
 */
export function useKeyboardOverlap(target: RefObject<HostInstance | null>, enabled: boolean): KeyboardOverlap {
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
      setState((current) => (current.visible ? current : { visible: true, height: current.height }));
      if (!ios) return;
      target.current?.measureInWindow((_x, y, _width, height) => {
        followKeyboard(event);
        setState({ visible: true, height: overlapWithKeyboard({ y, height }, event.endCoordinates.screenY) });
      });
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
  }, [enabled, reduceMotion, target]);

  return enabled ? state : HIDDEN;
}
