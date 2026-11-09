import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, touchTarget, type ColorToken, type IconSize } from '@/theme/tokens';

import { Icon } from './Icon';
import type { LucideIcon } from './icons';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style' | 'accessibilityLabel'> {
  icon: LucideIcon;
  /** Required: an icon-only control must say what it does. */
  accessibilityLabel: string;
  size?: IconSize;
  color?: ColorToken;
  style?: StyleProp<ViewStyle>;
}

/** Icon-only button with a 44 x 44 pt target and pressed background. */
export function IconButton({ icon, accessibilityLabel, size = 'md', color = 'textMuted', disabled, style, accessibilityState, ...rest }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.base, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
      {...rest}
    >
      <Icon icon={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.ghostPressed,
  },
  disabled: {
    opacity: 0.5,
  },
});
