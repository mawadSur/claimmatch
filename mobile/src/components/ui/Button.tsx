import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { lightImpact } from '@/lib/haptics';
import { colors, radii, shadows, space, touchTarget, type ColorToken, type TextColorToken } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import type { LucideIcon } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style' | 'disabled'> {
  /** Visible text; also the accessibility label unless one is given. */
  label: string;
  variant?: ButtonVariant;
  /** Shows a spinner, keeps the button's size and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Decorative icon beside the label. */
  icon?: LucideIcon;
  iconPosition?: 'leading' | 'trailing';
  /** Stretch to the container width. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface VariantStyle {
  background: ColorToken | 'transparent';
  pressed: ColorToken;
  text: TextColorToken;
  border?: ColorToken;
  shadow?: ViewStyle;
}

/** Mirrors .btn-primary, .btn-secondary and .btn-ghost in src/app/globals.css. */
const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: { background: 'primary', pressed: 'primaryPressed', text: 'onPrimary', shadow: shadows.button },
  secondary: { background: 'secondary', pressed: 'secondaryPressed', text: 'onSecondary', border: 'border' },
  ghost: { background: 'transparent', pressed: 'ghostPressed', text: 'onGhost' },
  danger: { background: 'surface', pressed: 'dangerActionPressed', text: 'dangerAction', border: 'dangerActionBorder' },
};

function colorOf(token: ColorToken | 'transparent'): string {
  return token === 'transparent' ? 'transparent' : colors[token];
}

/**
 * Text button, at least 44 pt tall. Press feedback is a color change on
 * press-in (no layout shift); primary buttons add a light haptic. Disabled
 * buttons are dimmed and announced as disabled; loading ones as busy.
 */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'leading',
  fullWidth = false,
  style,
  onPress,
  accessibilityLabel,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const look = VARIANTS[variant];
  const inactive = disabled || loading;

  function handlePress(event: GestureResponderEvent) {
    if (variant === 'primary') lightImpact();
    onPress?.(event);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        look.shadow,
        {
          backgroundColor: colorOf(pressed && !inactive ? look.pressed : look.background),
          borderColor: look.border ? colors[look.border] : 'transparent',
        },
        fullWidth ? styles.fullWidth : null,
        disabled && !loading ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      <View style={[styles.content, loading ? styles.hidden : null]}>
        {icon && iconPosition === 'leading' ? <Icon icon={icon} size="sm" color={look.text} /> : null}
        <AppText variant="label" color={look.text} align="center" style={styles.label}>
          {label}
        </AppText>
        {icon && iconPosition === 'trailing' ? <Icon icon={icon} size="sm" color={look.text} /> : null}
      </View>
      {loading ? (
        <View style={styles.spinner}>
          <ActivityIndicator color={colors[look.text]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + 4,
    minWidth: touchTarget,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    // Every variant has a 1 pt border (transparent when unused) so sizes match.
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  label: {
    flexShrink: 1,
  },
  hidden: {
    opacity: 0,
  },
  spinner: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
