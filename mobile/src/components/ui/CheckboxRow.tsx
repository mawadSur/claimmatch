import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, space, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { Check } from './icons';

export interface CheckboxRowProps {
  /** The question or statement; also the checkbox's spoken name. */
  label: string;
  /** Smaller text under the label. */
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /**
   * 'card' (default): the web's bordered checkbox rows, label in bold.
   * 'plain': a checkbox beside a sentence (the web's plain <label>), such as
   * a consent line inside a form.
   */
  appearance?: 'card' | 'plain';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A checkbox with its label: the whole row is one checkbox for screen
 * readers, at least 44 pt tall, and toggles on a tap anywhere.
 */
export function CheckboxRow({
  label,
  help,
  checked,
  onChange,
  disabled = false,
  appearance = 'card',
  style,
  testID,
}: CheckboxRowProps) {
  const plain = appearance === 'plain';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={help ? `${label}, ${help}` : label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.row,
        plain ? styles.plain : styles.card,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        {checked ? <Icon icon={Check} size="sm" color="onPrimary" strokeWidth={3} /> : null}
      </View>
      <View style={styles.text}>
        {plain ? (
          <AppText variant="caption" color="text">
            {label}
          </AppText>
        ) : (
          <AppText variant="label">{label}</AppText>
        )}
        {help ? <AppText variant="caption" color="textMuted">{help}</AppText> : null}
      </View>
    </Pressable>
  );
}

const BOX = 22;

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    borderRadius: radii.xl,
  },
  card: {
    minHeight: touchTarget + space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.background,
  },
  plain: {
    // Top-aligned like the card: a long sentence wraps beside the box (the web's items-start).
    paddingVertical: space[3] - 1,
    borderRadius: radii.lg,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.5,
  },
  box: {
    width: BOX,
    height: BOX,
    // Lines the box up with the first 20 pt line of the label.
    marginTop: -1,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.textSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    borderColor: colors.selected,
    backgroundColor: colors.selected,
  },
  text: {
    flex: 1,
    gap: space[1],
  },
});
