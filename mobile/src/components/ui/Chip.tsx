import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, space, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

export interface ChipProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  /** On/off state of a filter (the web's aria-pressed). */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Filter pill (the web's LawsuitFilters Pill, text-sm font-medium): navy when
 * selected, white with a hairline when not, and a visibly darker fill while
 * pressed. A toggle button for screen readers, at least 44 pt tall.
 */
export function Chip({ label, selected = false, disabled, style, accessibilityState, ...rest }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={label}
      accessibilityState={{ ...accessibilityState, checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed ? (selected ? styles.selectedPressed : styles.unselectedPressed) : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      {...rest}
    >
      <AppText variant="labelSmall" color={selected ? 'onSelected' : 'textMuted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.selected,
    borderColor: colors.selected,
  },
  selectedPressed: {
    backgroundColor: colors.primaryPressed,
    borderColor: colors.primaryPressed,
  },
  unselected: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
  },
  unselectedPressed: {
    backgroundColor: colors.chipPressed,
    borderColor: colors.borderBrand,
  },
  disabled: {
    opacity: 0.5,
  },
});
