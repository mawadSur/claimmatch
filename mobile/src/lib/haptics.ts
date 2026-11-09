import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * A light tap for primary actions. Android uses the system haptics engine,
 * which needs no VIBRATE permission. Failures are ignored: haptics are optional.
 */
export function lightImpact(): void {
  try {
    const done =
      Platform.OS === 'android'
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Promise.resolve(done).catch(() => undefined);
  } catch {
    // No haptics engine available.
  }
}
