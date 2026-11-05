import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { fontFamilies, space } from '@/theme/tokens';

/** The web's small uppercase fact label (text-xs font-bold uppercase tracking-wide text-ink-muted). */
export function FactLabel({ children }: { children: string }) {
  return (
    <AppText variant="badge" color="textMuted" style={styles.label}>
      {children}
    </AppText>
  );
}

export interface FactProps {
  label: string;
  value: string;
  /** A sentence under the value, such as the deadline cutoff note. */
  note?: string;
  /** 'strong': a bold value (the settlement page's facts); 'plain': the answer block's text-sm value. */
  emphasis?: 'strong' | 'plain';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A labeled fact (the web's dt/dd), read by screen readers as one phrase. */
export function Fact({ label, value, note, emphasis = 'plain', style, testID }: FactProps) {
  return (
    <View
      accessible
      accessibilityLabel={note ? `${label}: ${value}. ${note}` : `${label}: ${value}`}
      style={[styles.fact, style]}
      testID={testID}
    >
      <FactLabel>{label}</FactLabel>
      <AppText variant={emphasis === 'strong' ? 'bodyStrong' : 'caption'} color="text">
        {value}
      </AppText>
      {note ? (
        <AppText variant="caption" color="textMuted">
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamilies.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fact: {
    gap: space[1],
  },
});
