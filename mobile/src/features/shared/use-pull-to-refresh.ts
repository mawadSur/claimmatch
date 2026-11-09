import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pull to refresh for a React Query screen. The spinner shows only for a
 * refresh the user pulled for, never for background refetches, and stops
 * when the load ends either way (an error shows on the screen). `onSettled`
 * runs after every pull, loaded or not.
 */
export function usePullToRefresh(
  refetch: () => Promise<unknown>,
  onSettled?: () => void,
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(false);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch()
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setRefreshing(false);
        settled.current?.();
      });
  }, [refetch]);

  return { refreshing, onRefresh };
}
