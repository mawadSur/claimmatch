import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** A query's refetch (React Query's `refetch` fits). */
export type Refetch = (options?: { cancelRefetch?: boolean }) => unknown;

/**
 * "Refetch on focus" (plan 3.3): loads a screen's data again when the screen
 * comes back into focus (back from a pushed screen, another tab, a modal) and
 * when the app returns to the foreground while the screen is focused. The
 * first focus is skipped, since the query loads on mount. A refetch joins one
 * already running instead of restarting it.
 */
export function useRefetchOnFocus(refetch: Refetch, options: { enabled?: boolean } = {}): void {
  const enabled = options.enabled ?? true;
  const latest = useRef(refetch);
  const focused = useRef(false);
  const focusedBefore = useRef(false);

  useEffect(() => {
    latest.current = refetch;
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (focusedBefore.current && enabled) void latest.current({ cancelRefetch: false });
      focusedBefore.current = true;
      return () => {
        focused.current = false;
      };
    }, [enabled]),
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) void latest.current({ cancelRefetch: false });
    });
    return () => subscription.remove();
  }, [enabled]);
}
