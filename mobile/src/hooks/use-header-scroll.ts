import { NavigationRouteContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** Where a tab root's scroll view rests with its large title open, and the restKey it was shown with. */
interface RouteRest {
  offset: number;
  key: string;
}

/** Per navigation route key; only screens that pass a restKey (the tab roots) are kept. */
const restByRoute = new Map<string, RouteRest>();

/** How long after moving a view to its rest a further shift by iOS is still undone. */
const SETTLE_MS = 1000;

export interface HeaderScrollOptions {
  /** Scrolls the view to `y` (ScrollView scrollTo, FlatList scrollToOffset). */
  scrollTo: (y: number, animated: boolean) => void;
  /**
   * For a tab root whose content is replaced when the person signs in or out:
   * the auth status. See useHeaderScroll.
   */
  restKey?: string;
}

export interface HeaderScrollProps {
  scrollToOverflowEnabled: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onContentSizeChange: (width: number, height: number) => void;
}

/**
 * Props for a screen's main scroll view on iOS, whose content rests under the
 * header (a large title or the see-through iOS 26 bar), at a negative offset.
 * Elsewhere they change nothing.
 *
 * - The keyboard. A scroll view with automaticallyAdjustKeyboardInsets
 *   scrolls through React Native's scrollTo whenever the keyboard opens or
 *   closes, and scrollTo keeps the offset between 0 and the content's end,
 *   ignoring the header (React Native 0.88, RCTScrollViewComponentView.mm):
 *   a resting view jumped under its header and a large title collapsed.
 *   scrollToOverflowEnabled skips that limit, so it is on while the view sits
 *   above 0, and while its content is shorter than the view (the limit would
 *   then pin it at 0). Elsewhere the limit stays, so a view that the keyboard
 *   lifted past its end to show a low field settles back when the keyboard
 *   closes. A short view that the keyboard lifted goes back to where it was.
 *
 * - Signing in or out. A tab root then shows a new scroll view, and iOS rests
 *   it under the small title when the large title had collapsed (the old
 *   content was scrolled). With `restKey` set, the first scroll view on the
 *   route records where it rests (its first offset, the large title open);
 *   a scroll view that first appears after the key changed is moved there.
 *   Opening the large title makes iOS shift the offset once more, so a shift
 *   past the rest right after the move is undone, unless the person is
 *   dragging.
 */
export function useHeaderScroll({ scrollTo, restKey }: HeaderScrollOptions): HeaderScrollProps {
  const routeKey = useContext(NavigationRouteContext)?.key;
  const ios = Platform.OS === 'ios';
  const [overflow, setOverflow] = useState(true);
  const view = useRef({ y: null as number | null, contentHeight: 0, height: 0, overflow: true });
  const placed = useRef(false);
  const settling = useRef<{ target: number; until: number } | null>(null);
  const beforeKeyboard = useRef<number | null>(null);
  const latest = useRef({ scrollTo, restKey, routeKey });
  useEffect(() => {
    latest.current = { scrollTo, restKey, routeKey };
  });

  function updateOverflow() {
    const { y, contentHeight, height } = view.current;
    // Until the first offset arrives the view is taken to rest under its header, as it starts there.
    const next = y === null || y < 0 || (height > 0 && contentHeight <= height);
    if (next !== view.current.overflow) {
      view.current.overflow = next;
      setOverflow(next);
    }
  }

  // A short view the keyboard lifted (the limit is off there) goes back when it closes.
  useEffect(() => {
    if (!ios) return undefined;
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', () => {
        if (beforeKeyboard.current === null) beforeKeyboard.current = view.current.y;
      }),
      Keyboard.addListener('keyboardWillHide', () => {
        const before = beforeKeyboard.current;
        beforeKeyboard.current = null;
        const { y, contentHeight, height } = view.current;
        if (before === null || y === null || height === 0 || contentHeight > height) return;
        if (y > before + 0.5) latest.current.scrollTo(before, true);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [ios]);

  /** The view's first offset: where iOS placed it under the header. */
  function place(y: number) {
    const { routeKey: route, restKey: key, scrollTo: scroll } = latest.current;
    if (route === undefined || key === undefined) return;
    const rest = restByRoute.get(route);
    if (!rest) {
      restByRoute.set(route, { offset: y, key });
      return;
    }
    const keyChanged = rest.key !== key;
    rest.key = key;
    if (keyChanged && y > rest.offset + 0.5) {
      settling.current = { target: rest.offset, until: Date.now() + SETTLE_MS };
      scroll(rest.offset, false);
      return;
    }
    rest.offset = Math.min(rest.offset, y);
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!ios) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    view.current.y = y;
    view.current.contentHeight = contentSize.height;
    view.current.height = layoutMeasurement.height;
    updateOverflow();
    if (!placed.current) {
      placed.current = true;
      place(y);
      return;
    }
    const pending = settling.current;
    if (!pending) return;
    if (Date.now() > pending.until) {
      settling.current = null;
    } else if (y < pending.target - 0.5) {
      settling.current = null;
      latest.current.scrollTo(pending.target, false);
    }
  }

  function onScrollBeginDrag() {
    settling.current = null;
  }

  function onContentSizeChange(_width: number, height: number) {
    if (!ios) return;
    view.current.contentHeight = height;
    updateOverflow();
  }

  return { scrollToOverflowEnabled: ios && overflow, onScroll, onScrollBeginDrag, onContentSizeChange };
}
