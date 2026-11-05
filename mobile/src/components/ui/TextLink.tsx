import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { fontFamilies, space, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';

export interface TextLinkProps {
  label: string;
  onPress: () => void;
  /** Spoken name when the visible text needs context. */
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A text link to another screen of the app (the web's .text-link and inline
 * next/link: semibold, brand, underlined). At least 44 pt tall even where it
 * reads as inline text, and announced as a link. Websites use
 * ExternalLinkButton or the features' ExternalTextLink instead.
 */
export function TextLink({ label, onPress, accessibilityLabel, disabled = false, style, testID }: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={{ left: space[2], right: space[2] }}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null, disabled ? styles.disabled : null, style]}
      testID={testID}
    >
      <AppText variant="labelSmall" color="textLink" style={styles.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fontFamilies.sansSemibold,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
});
