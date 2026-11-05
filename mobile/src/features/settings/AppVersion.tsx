import * as Application from 'expo-application';

import { AppText } from '@/components/ui';
import { settings } from '@/copy/settings';
import { fillCopy } from '@/copy/shared';

/** "Version 1.0.0 (12)": the store version and build of this binary, for support. */
export function appVersionText(version: string | null, build: string | null): string | null {
  if (!version) return null;
  return fillCopy(settings.version.text, { version, build: build ?? '?' });
}

/** The app version line at the end of Settings (plan 3.3). Selectable, so it can be copied into a support email. */
export function AppVersion() {
  const text = appVersionText(Application.nativeApplicationVersion, Application.nativeBuildVersion);
  if (!text) return null;
  return (
    <AppText variant="caption" color="textSoft" align="center" selectable testID="settings-version">
      {text}
    </AppText>
  );
}
