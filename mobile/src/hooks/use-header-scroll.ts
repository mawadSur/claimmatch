import { NavigationRouteContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, PixelRatio, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** What a tab root's route knows about its scroll views. */
interface RouteRecord {
  /**
   * Where its scroll view rests with the large title open, by the font scale
   * that was measured at. Kept per text size: a single Math.min across sizes
   * kept the rest of a larger size, which then moved views past their rest
   * once the text was smaller again.
   */
  rests: Map<number, number>;
  /** The font scale of the rest measured last. */
  lastFontScale: number | null;
  /**
   * A rest measured at one text size was further down than at another: the
   * large title grows with the text. Until that is seen, a rest measured at
   * another size is used, as the app's headers keep their font size at every
   * text size (theme/navigation.ts), so their rest does not change.
   */
  followsTextSize: boolean;
  /** The latest restKey a mounted view on the route was shown with. */
  key: string;
  /** The key changed since a view on the route was last placed. */
  keyChanged: boolean;
}

/** Per navigation route key; only screens that pass a restKey (the tab roots) are kept. */
const routes = new Map<string, RouteRecord>();

/**
 * Records `key` as the latest restKey of `route`, noting a change. A view
 * calls it when it mounts or its key changes, placed or not: a tab root
 * replaced while its tab is off screen never scrolls, so placing it would
 * miss the change.
 */
function noteRestKey(route: string, key: string): RouteRecord {
  const record = routes.get(route);
  if (!record) {
    const fresh: RouteRecord = { rests: new Map(), lastFontScale: null, followsTextSize: false, key, keyChanged: false };
    routes.set(route, fresh);
    return fresh;
  }
  if (record.key !== key) {
    record.key = key;
    record.keyChanged = true;
  }
  return record;
}

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
 *   content was scrolled). With `restKey` set, the route keeps the latest key
 *   its mounted views were shown with, and the first scroll view on the route
 *   records where it rests (its first offset, the large title open). A scroll
 *   view that first appears after the key changed is moved there, also when
 *   the views in between never appeared (their tab was off screen). Opening
 *   the large title makes iOS shift the offset once more, so a shift past the
 *   rest right after the move is undone, unless the person is dragging.
 *
 * - The text size. The rest is kept per font scale. At a size with no rest
 *   yet, a view placed with the title open records it there; a view under the
 *   small title is moved to the rest of the last size measured, unless the
 *   rest has been seen to change with the text size: then nothing is known
 *   about the rest at this size, and the view stays where iOS put it rather
 *   than ending up past its rest.
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

  useEffect(() => {
    if (routeKey !== undefined && restKey !== undefined) noteRestKey(routeKey, restKey);
  }, [routeKey, restKey]);

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
    const record = noteRestKey(route, key);
    const keyChanged = record.keyChanged;
    record.keyChanged = false;
    const fontScale = PixelRatio.getFontScale();
    const measured = record.rests.get(fontScale);
    const rest = measured ?? (record.lastFontScale === null ? undefined : record.rests.get(record.lastFontScale));
    const measure = (offset: number) => {
      record.rests.set(fontScale, offset);
      record.lastFontScale = fontScale;
    };
    if (rest === undefined) {
      measure(y);
      return;
    }
    if (measured === undefined && y < rest - 0.5) {
      // Further down than the rest at another text size: the large title grew with the text.
      record.followsTextSize = true;
      measure(y);
      return;
    }
    if (keyChanged && y > rest + 0.5) {
      if (measured === undefined && record.followsTextSize) return;
      settling.current = { target: rest, until: Date.now() + SETTLE_MS };
      scroll(rest, false);
      return;
    }
    // Higher than a rest from another size tells nothing: the small title, or a large title that shrank.
    if (measured !== undefined || y <= rest + 0.5) measure(Math.min(rest, y));
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
