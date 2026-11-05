import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, space, typography, type ColorToken } from '@/theme/tokens';

/** One item of a bulleted list (the web's list-disc). The dot is decorative. */
export function Bullet({ children, dot = 'textMuted' }: { children: ReactNode; dot?: ColorToken }) {
  return (
    <View style={styles.item}>
      <View
        accessible={false}
        importantForAccessibility="no"
        style={[styles.dot, { backgroundColor: colors[dot] }]}
      />
      <View style={styles.text}>{children}</View>
    </View>
  );
}

export function Bullets({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

const DOT = 5;

const styles = StyleSheet.create({
  list: {
    gap: space[2],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radii.full,
    // Centered on the first line of caption text.
    marginTop: ((typography.caption.lineHeight ?? 20) - DOT) / 2,
  },
  text: {
    flex: 1,
    gap: space[2],
  },
});
