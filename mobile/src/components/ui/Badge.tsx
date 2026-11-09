import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, space, type ColorToken, type TextColorToken } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import type { LucideIcon } from './icons';

export type BadgeTone = 'brand' | 'green' | 'red' | 'gray' | 'gold' | 'amber';

interface ToneStyle {
  background: ColorToken;
  border: ColorToken;
  text: TextColorToken;
}

/** Mirrors .badge-brand/-green/-red/-gray/-gold in globals.css and the amber UnverifiedLabel. */
const TONES: Record<BadgeTone, ToneStyle> = {
  brand: { background: 'surfaceBrand', border: 'surfaceBrand', text: 'textLink' },
  green: { background: 'successSurface', border: 'successBorder', text: 'success' },
  red: { background: 'dangerSurface', border: 'dangerSurface', text: 'danger' },
  gray: { background: 'surface', border: 'divider', text: 'textMuted' },
  gold: { background: 'goldSurface', border: 'goldBorder', text: 'gold' },
  amber: { background: 'warningSurface', border: 'warningBorder', text: 'warningStrong' },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Small leading icon, such as TriangleAlert on the unverified badge. */
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Status pill. Read as plain text by screen readers; text wraps at large sizes. */
export function Badge({ label, tone = 'gray', icon, style, testID }: BadgeProps) {
  const look = TONES[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: colors[look.background], borderColor: colors[look.border] }, style]}
      testID={testID}
    >
      {icon ? <Icon icon={icon} size="xs" color={look.text} /> : null}
      <AppText variant="badge" color={look.text} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  label: {
    flexShrink: 1,
  },
});
