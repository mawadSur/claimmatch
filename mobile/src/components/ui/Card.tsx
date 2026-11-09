import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, shadows, space, type SpaceToken } from '@/theme/tokens';

export interface CardProps {
  children: ReactNode;
  /** Inner padding (default space[5], the web's p-5). */
  padding?: SpaceToken;
  /** Makes the whole card one button; give it an accessibilityLabel that sums it up. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The web's .surface / .settlement-card: white, hairline border, rounded-2xl, soft shadow. */
export function Card({ children, padding = 5, onPress, accessibilityLabel, accessibilityHint, style, testID }: CardProps) {
  const base = [styles.card, { padding: space[padding] }];
  if (!onPress) {
    return (
      <View style={[base, style]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [base, pressed ? styles.pressed : null, style]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.card,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderBrand,
  },
});
