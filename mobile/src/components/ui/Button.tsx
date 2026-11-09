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
  /**
   * A ghost button in a column of text: pulls the button out by its side
   * padding on that side ('start' for a button at the start of a line, 'end'
   * at its end), so the label lines up with the text while the touch target
   * keeps its full size. The content then sits on that side, and a label that
   * wraps is aligned to it: with 'start', every line begins after the icon.
   */
  bleed?: 'start' | 'end';
  /**
   * How far a bleeding button reaches out, in points (default: its side
   * padding). Inside a box padded less than that, such as a 16 pt card, pass
   * the box's padding: the pressed color and the focus frame then stop at the
   * box's edge, and the label sits that much further in.
   */
  bleedBy?: number;
  style?: StyleProp<ViewStyle>;
}

/** A button's side padding: how far a bleeding ghost button reaches past the text column. */
export const BUTTON_PADDING_X = space[5];

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

/** The margin that pulls a bleeding button out, and how its content lines up on that side. */
function bleedLayout(bleed: 'start' | 'end', by: number) {
  return bleed === 'start'
    ? { button: [styles.alignStart, { marginStart: -by }], content: styles.contentStart, align: 'left' as const }
    : { button: [styles.alignEnd, { marginEnd: -by }], content: styles.contentEnd, align: 'right' as const };
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
  bleed,
  bleedBy = BUTTON_PADDING_X,
  style,
  onPress,
  accessibilityLabel,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const look = VARIANTS[variant];
  const inactive = disabled || loading;
  const side = bleed ? bleedLayout(bleed, bleedBy) : null;

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
        side?.button,
        disabled && !loading ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      <View style={[styles.content, side?.content, loading ? styles.hidden : null]}>
        {icon && iconPosition === 'leading' ? <Icon icon={icon} size="sm" color={look.text} /> : null}
        <AppText variant="label" color={look.text} align={side?.align ?? 'center'} style={styles.label}>
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
    paddingHorizontal: BUTTON_PADDING_X,
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
  alignStart: {
    alignItems: 'flex-start',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  contentStart: {
    justifyContent: 'flex-start',
  },
  contentEnd: {
    justifyContent: 'flex-end',
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
