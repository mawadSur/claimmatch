import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { ChevronRight, type LucideIcon } from './icons';

/** From this Dynamic Type scale up, a `value` moves under the title instead of beside it. */
export const STACK_VALUE_FONT_SCALE = 1.3;

export interface ListItemToggle {
  value: boolean;
  onValueChange: (next: boolean) => void;
}

export interface ListItemProps {
  title: string;
  /** Second line under the title. */
  subtitle?: string;
  /** Short trailing text, such as a current value. Moves under the title at large text sizes. */
  value?: string;
  /** Leading decorative icon. */
  icon?: LucideIcon;
  /**
   * Makes the whole row one switch, such as "Deadline reminders": the title
   * (and subtitle) is its label and a tap anywhere on the row toggles it.
   * Use this for every on/off setting instead of a Switch in `trailing`.
   */
  toggle?: ListItemToggle;
  /**
   * Trailing content instead of the chevron, such as a Badge. A control placed
   * here is read on its own, so it must carry its own accessibilityLabel.
   */
  trailing?: ReactNode;
  onPress?: () => void;
  /** 'link' for rows that open a website; default 'button'. */
  accessibilityRole?: 'button' | 'link';
  accessibilityHint?: string;
  /** Red title, for actions such as "Delete my account and data". */
  destructive?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Settings-style row, at least 52 pt tall. Pressable rows show a chevron and
 * a pressed background. Text wraps at large Dynamic Type sizes: the title
 * keeps at least 45% of the row next to a value, and from
 * STACK_VALUE_FONT_SCALE the value moves under the title.
 */
export function ListItem({
  title,
  subtitle,
  value,
  icon,
  toggle,
  trailing,
  onPress,
  accessibilityRole = 'button',
  accessibilityHint,
  destructive = false,
  disabled = false,
  style,
  testID,
}: ListItemProps) {
  const { fontScale } = useWindowDimensions();
  const valueBeside = value ? fontScale < STACK_VALUE_FONT_SCALE : false;

  const valueText = value ? (
    <AppText variant="caption" style={valueBeside ? styles.valueBeside : null} testID={testID ? `${testID}-value` : undefined}>
      {value}
    </AppText>
  ) : null;

  const text = (
    <View
      style={[styles.text, valueBeside ? styles.textBesideValue : styles.textFill]}
      testID={testID ? `${testID}-text` : undefined}
    >
      <AppText variant="label" color={destructive ? 'dangerAction' : 'text'}>
        {title}
      </AppText>
      {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      {valueBeside ? null : valueText}
    </View>
  );

  const leading = icon ? <Icon icon={icon} size="md" color={destructive ? 'dangerAction' : 'textMuted'} /> : null;

  if (toggle) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: toggle.value, disabled }}
        disabled={disabled}
        onPress={() => toggle.onValueChange(!toggle.value)}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
        testID={testID}
      >
        {leading}
        {text}
        {valueBeside ? valueText : null}
        {/* Shows the state only: the row is the control, so the Switch takes no touches and is hidden from screen readers. */}
        <View style={styles.switch} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch
            value={toggle.value}
            disabled={disabled}
            trackColor={{ true: colors.primary }}
            thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
          />
        </View>
      </Pressable>
    );
  }

  const content = (
    <>
      {leading}
      {text}
      {valueBeside ? valueText : null}
      {trailing ?? (onPress ? <Icon icon={ChevronRight} size="sm" color="textSoft" /> : null)}
    </>
  );

  if (!onPress) {
    // Read as one element, unless the trailing slot holds its own control.
    return (
      <View accessible={!trailing} style={[styles.row, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget + space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    gap: space[1],
  },
  /** No value beside it: the text takes the free width. */
  textFill: {
    flex: 1,
  },
  /**
   * Next to a value: sized from its content and shrinkable, but never below
   * 45% of the row, so the title wraps by word instead of collapsing to one
   * letter per line.
   */
  textBesideValue: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: '45%',
  },
  valueBeside: {
    flexShrink: 1,
    maxWidth: '50%',
    textAlign: 'right',
  },
  switch: {
    pointerEvents: 'none',
  },
});
