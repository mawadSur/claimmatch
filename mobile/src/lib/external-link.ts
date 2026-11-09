import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Only websites open, and only over https: an http URL is opened as https,
 * because people type their name, address and claim details into official
 * forms. A URL carrying a user name or password is refused, as is anything
 * that is not a website (javascript:, file:, intent:, tel:, malformed).
 */
export function toSafeWebUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.protocol === 'https:' ? url.href : new URL(`https:${url.href.slice('http:'.length)}`).href;
  } catch {
    return null;
  }
}

/**
 * Opens a website in the in-app browser (SFSafariViewController on iOS,
 * Chrome Custom Tabs on Android), tinted with the brand color. On iOS the
 * promise resolves when the browser closes; on Android it resolves as soon as
 * the browser opens, so watch AppState to know when the user is back.
 * Falls back to the system browser if no in-app browser is available.
 * Returns null when the URL is not a website or did not open in-app.
 */
export async function openExternalUrl(url: string): Promise<WebBrowser.WebBrowserResult | null> {
  const safe = toSafeWebUrl(url);
  if (!safe) return null;
  try {
    return await WebBrowser.openBrowserAsync(safe, {
      controlsColor: colors.primary,
      dismissButtonStyle: 'close',
      ...(Platform.OS === 'android'
        ? { toolbarColor: colors.primary, secondaryToolbarColor: colors.primaryPressed, showTitle: true }
        : null),
    });
  } catch {
    await Linking.openURL(safe).catch(() => undefined);
    return null;
  }
}
