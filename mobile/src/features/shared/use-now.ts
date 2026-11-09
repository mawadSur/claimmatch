import { todayInDeadlineZone } from '@shared/lib/utils';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { now } from '@/lib/clock';

/**
 * "Now" for deadline labels ("12 days left", "Closes today", open or
 * closed). It changes only when the date in the deadline zone
 * (America/New_York) changes, checked every minute and when the app returns
 * to the foreground, so a screen left open past midnight updates while list
 * rows do not re-render every minute. Skew-corrected (src/lib/clock.ts).
 */

const CHECK_EVERY_MS = 60_000;

let current = now();
let currentDay = todayInDeadlineZone(current);
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function check(): void {
  const next = now();
  const day = todayInDeadlineZone(next);
  if (day === currentDay) return;
  current = next;
  currentDay = day;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    // The value may be from long ago: the day may have changed while nothing listened.
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    stop = () => {
      clearInterval(timer);
      subscription.remove();
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

function getSnapshot(): Date {
  return current;
}

/** The current time for deadline labels; a new value only when the deadline-zone date changes. */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot);
}
