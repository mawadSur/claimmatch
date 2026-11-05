import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme/tokens';

import { AppText } from './AppText';

export interface SectionHeaderProps {
  title: string;
  /** Optional line under the title. */
  description?: string;
  /** Optional trailing action, such as a small ghost Button. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Heading above a group of content; announced as a header. */
export function SectionHeader({ title, description, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <AppText variant="heading">{title}</AppText>
        {description ? <AppText variant="caption">{description}</AppText> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: space[3],
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    gap: space[1],
  },
  action: {
    flexShrink: 0,
  },
});
