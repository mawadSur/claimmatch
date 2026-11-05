import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAnnounce } from '@/hooks/use-announce';
import { colors, radii, space, typography, type ColorToken, type TextColorToken } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from './icons';

/** 'unverified' is the amber "Unverified: check the official site" notice. */
export type NoticeTone = 'unverified' | 'info' | 'error' | 'success';

interface ToneStyle {
  icon: LucideIcon;
  iconColor: ColorToken;
  background: ColorToken;
  border: ColorToken;
  text: TextColorToken;
  /** Status messages are announced when they appear or change (WCAG 4.1.3); 'none' for static content. */
  liveRegion: 'assertive' | 'polite' | 'none';
}

const TONES: Record<NoticeTone, ToneStyle> = {
  unverified: {
    icon: TriangleAlert,
    iconColor: 'warningIcon',
    background: 'warningSurface',
    border: 'warningBorder',
    text: 'warning',
    liveRegion: 'none',
  },
  info: { icon: Info, iconColor: 'infoIcon', background: 'infoSurface', border: 'infoBorder', text: 'info', liveRegion: 'none' },
  error: {
    icon: CircleAlert,
    iconColor: 'dangerIcon',
    background: 'dangerSurface',
    border: 'dangerBorder',
    text: 'danger',
    liveRegion: 'assertive',
  },
  success: {
    icon: CircleCheck,
    iconColor: 'successIcon',
    background: 'successSurface',
    border: 'successBorder',
    text: 'success',
    liveRegion: 'polite',
  },
};

export interface NoticeProps {
  tone: NoticeTone;
  title?: string;
  body?: string;
  /** Extra content under the body, such as a link button. */
  children?: ReactNode;
  /**
   * Announce the notice to screen readers when it appears or its text
   * changes. Defaults to true for 'error' and 'success' (save and network
   * results), false for the static 'info' and 'unverified' notices.
   */
  announce?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Icon + title + body box (the catalog's amber notice, rounded-xl p-4).
 * Without extra children it is read as one element. Error and success
 * notices are announced when they appear or change: through an Android live
 * region, and through an iOS announcement queued behind current speech
 * (iOS has no live regions, and the "alert" role adds no iOS trait).
 */
export function Notice({ tone, title, body, children, announce, style, testID }: NoticeProps) {
  const look = TONES[tone];
  const grouped = !children;
  const live = announce ?? look.liveRegion !== 'none';
  const message = [title, body].filter(Boolean).join('. ');

  useAnnounce(live ? message : null);

  return (
    <View
      accessible={grouped}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={live ? (look.liveRegion === 'none' ? 'polite' : look.liveRegion) : 'none'}
      style={[styles.notice, { backgroundColor: colors[look.background], borderColor: colors[look.border] }, style]}
      testID={testID}
    >
      {/* As tall as the first line of text, so the icon centers on it. */}
      <View style={[styles.icon, { minHeight: (title ? typography.bodyStrong : typography.caption).lineHeight }]}>
        <Icon icon={look.icon} size="md" color={look.iconColor} />
      </View>
      <View style={styles.text}>
        {title ? (
          <AppText variant="bodyStrong" color={look.text}>
            {title}
          </AppText>
        ) : null}
        {body ? (
          <AppText variant="caption" color={look.text}>
            {body}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  icon: {
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: space[1],
  },
});
