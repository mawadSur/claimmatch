import { useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { common } from '@/copy/common';
import { colors, maxFontScale, radii, space, touchTarget, typography } from '@/theme/tokens';

import { AppText } from './AppText';
import { FieldError } from './FieldError';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Eye, EyeOff, type LucideIcon } from './icons';
import { STACK_VALUE_FONT_SCALE } from './ListItem';

export interface TextFieldProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'editable' | 'secureTextEntry' | 'ref' | 'accessibilityLabel'> {
  /** Visible label, also the input's spoken name. */
  label: string;
  /** Shown after the label in a lighter weight, such as "(optional)", and spoken with it. */
  labelSuffix?: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error under the field, announced when it appears. */
  error?: string | null;
  /** Leading decorative icon (the web's Mail, Lock and User icons). */
  icon?: LucideIcon;
  /** A password: hidden, with a Show password / Hide password button. */
  secure?: boolean;
  disabled?: boolean;
  /** A control beside the input, such as a Copy button. It moves under the input at large text sizes. */
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
}

/**
 * Labeled text input (the web's .field-label and .field-input): at least
 * 48 pt tall, grows with Dynamic Type, brand ring while focused and red when
 * invalid. Pass keyboardType, textContentType, autoComplete, returnKeyType and
 * onSubmitEditing through. Screen readers hear the label as the input's name
 * and the error as its hint; the error also shows and is announced below.
 */
export function TextField({
  label,
  labelSuffix,
  hint,
  error,
  icon,
  secure = false,
  disabled = false,
  trailing,
  containerStyle,
  testID,
  onFocus,
  onBlur,
  accessibilityHint,
  ref,
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const { fontScale } = useWindowDimensions();
  const stacked = trailing != null && fontScale >= STACK_VALUE_FONT_SCALE;

  const box = (
    <View
      style={[
        styles.box,
        trailing != null && !stacked ? styles.grow : null,
        focused ? styles.focused : null,
        error ? styles.invalid : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {icon ? <Icon icon={icon} size="sm" color="textSoft" /> : null}
      <TextInput
        ref={ref}
        {...input}
        editable={!disabled}
        secureTextEntry={secure && hidden}
        accessibilityLabel={labelSuffix ? `${label} ${labelSuffix}` : label}
        accessibilityHint={error || accessibilityHint}
        accessibilityState={{ disabled }}
        placeholderTextColor={colors.textPlaceholder}
        allowFontScaling
        maxFontSizeMultiplier={maxFontScale.body}
        underlineColorAndroid="transparent"
        cursorColor={colors.primary}
        selectionColor={Platform.OS === 'ios' ? colors.primary : undefined}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={styles.input}
        testID={testID}
      />
      {secure ? (
        <IconButton
          icon={hidden ? Eye : EyeOff}
          accessibilityLabel={hidden ? common.showPassword.text : common.hidePassword.text}
          onPress={() => setHidden((value) => !value)}
          disabled={disabled}
          testID={testID ? `${testID}-reveal` : undefined}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.field, containerStyle]}>
      {/* The input carries the label for screen readers, so the visible one is not read twice. */}
      <AppText variant="label" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
        {labelSuffix ? (
          <AppText variant="caption" color="textMuted">
            {` ${labelSuffix}`}
          </AppText>
        ) : null}
      </AppText>
      {trailing != null ? (
        <View style={stacked ? styles.stacked : styles.row} testID={testID ? `${testID}-row` : undefined}>
          {box}
          {trailing}
        </View>
      ) : (
        box
      )}
      {hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
      <FieldError message={error} testID={testID ? `${testID}-error` : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  stacked: {
    alignItems: 'flex-start',
    gap: space[2],
  },
  grow: {
    flex: 1,
  },
  box: {
    alignSelf: 'stretch',
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[3],
    paddingRight: space[1],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // Color only: a thicker border would shift the text.
  focused: {
    borderColor: colors.focusRing,
  },
  invalid: {
    borderColor: colors.dangerIcon,
  },
  disabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    // No lineHeight: on iOS it shifts single-line text off center.
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.text,
    paddingVertical: space[3],
    paddingHorizontal: 0,
  },
});
