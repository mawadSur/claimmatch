import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radii, space } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';
import type { LucideIcon } from './icons';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Decorative icon in a brand tile (the web's h-12 w-12 rounded-xl bg-brand-100). */
  icon?: LucideIcon;
  /** Usually one or two Buttons. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Centered message for empty lists and finished flows. */
export function EmptyState({ title, body, icon, action, style, testID }: EmptyStateProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {icon ? (
        <View style={styles.tile}>
          <Icon icon={icon} size="lg" color="textLink" />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="heading" align="center">
          {title}
        </AppText>
        {body ? (
          <AppText variant="body" color="textMuted" align="center">
            {body}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={styles.actions}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: space[4],
    paddingVertical: space[8],
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  tile: {
    width: space[12],
    height: space[12],
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    gap: space[2],
    alignSelf: 'stretch',
  },
  actions: {
    alignSelf: 'stretch',
    gap: space[3],
    paddingTop: space[2],
  },
});
