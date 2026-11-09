import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space, type SpaceToken } from '@/theme/tokens';

export interface DividerProps {
  /** Left inset, for example to line up with list row text. */
  inset?: SpaceToken;
  style?: StyleProp<ViewStyle>;
}

/** Hairline separator; invisible to screen readers. */
export function Divider({ inset = 0, style }: DividerProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[styles.line, { marginLeft: space[inset] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.divider,
  },
});
