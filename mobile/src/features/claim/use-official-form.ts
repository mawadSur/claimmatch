import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { openExternalUrl } from '@/lib/external-link';

type Phase = 'idle' | 'opening' | 'opened' | 'left';

/**
 * Opens the official claim form in the in-app browser and calls `onBack`
 * once the person is back on this screen (plan 3.3: Step 2, then Step 3).
 * On iOS the browser's promise settles when it closes. On Android it settles
 * as soon as the browser opens, so the return is the app coming back to the
 * foreground after the browser took it over. If nothing opened in-app, there
 * is nothing to come back from.
 */
export function useOfficialFormOpener(onBack: () => void): (url: string) => Promise<void> {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const phase = useRef<Phase>('idle');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (phase.current === 'idle') return;
      if (state !== 'active') {
        phase.current = 'left';
        return;
      }
      if (phase.current === 'left') {
        phase.current = 'idle';
        latest.current();
      }
    });
    return () => subscription.remove();
  }, []);

  return useCallback(async (url: string) => {
    if (phase.current === 'opening') return;
    phase.current = 'opening';
    const result = await openExternalUrl(url);
    if (result?.type === 'opened') {
      // Android: wait for the app to come back (it may already have left).
      if (phase.current === 'opening') phase.current = AppState.currentState === 'active' ? 'opened' : 'left';
      return;
    }
    if (result?.type === 'cancel' || result?.type === 'dismiss') {
      // iOS: the browser was closed.
      phase.current = 'idle';
      latest.current();
      return;
    }
    // Not opened in-app ('locked': a browser is already open). If the system
    // browser took over, the app has left and the return still counts.
    if (phase.current === 'opening') phase.current = 'idle';
  }, []);
}
