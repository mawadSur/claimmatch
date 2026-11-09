import { Platform } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { app } from '@/copy/app';
import { common } from '@/copy/common';
import { useConfig } from '@/providers/ConfigProvider';

import { BrandMark } from './BrandMark';

/**
 * Blocking screen when this build is older than the server's minimum
 * (`minBuild` from /api/mobile/config). "Try again" re-checks, in case the
 * minimum was lowered, and shows a spinner while it does. An App Store /
 * Google Play button joins it once the store listings exist.
 */
export function UpdateRequired() {
  const { refetch, refreshing } = useConfig();
  return (
    <Screen headerShown={false} centered testID="update-required">
      <BrandMark />
      <AppText variant="display" align="center">
        {app.updateRequiredTitle.text}
      </AppText>
      <AppText variant="body" color="textMuted" align="center">
        {Platform.OS === 'android' ? app.updateRequiredBodyAndroid.text : app.updateRequiredBodyIos.text}{' '}
        {app.updateRequiredSafe.text}
      </AppText>
      <Button label={common.tryAgain.text} variant="secondary" onPress={refetch} loading={refreshing} fullWidth />
    </Screen>
  );
}
