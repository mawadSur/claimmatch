import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Divider } from '@/components/ui';
import { colors, radii } from '@/theme/tokens';

/**
 * A rounded group of settings rows (the native grouped-list look), with
 * hairlines between rows lined up with the row text after the icon.
 * Empty children (null, false) are skipped.
 */
export function SettingsGroup({
  children,
  inset = 12,
  style,
  testID,
}: {
  children: ReactNode;
  /** Divider inset: 12 (48 pt) lines up with text after a row icon; 4 (16 pt) for rows without one. */
  inset?: 4 | 12;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]} testID={testID}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <Divider inset={inset} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radii['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
