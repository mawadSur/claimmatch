import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Reads a message aloud when it appears or changes: an iOS announcement
 * queued behind current speech (iOS has no live regions). On Android, put
 * accessibilityLiveRegion on the element that shows the message instead.
 * `skipFirst`: the value on mount is part of the screen as it opens, not news
 * (for example a result count).
 */
export function useAnnounce(message: string | null | undefined, { skipFirst = false }: { skipFirst?: boolean } = {}): void {
  const last = useRef<string | null>(skipFirst ? (message ?? null) : null);
  useEffect(() => {
    const next = message || null;
    if (next === last.current) return;
    last.current = next;
    if (next && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(next, { queue: true });
  }, [message]);
}
