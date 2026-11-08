import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import { Info } from '@/components/ui/icons';
import { shared } from '@/copy/shared';
import { useConfig } from '@/providers/ConfigProvider';
import { colors, radii, space } from '@/theme/tokens';

/**
 * The legal text, from GET /api/mobile/config (so counsel can change it
 * without an app release), or the bundled src/lib/disclaimer.ts when the
 * config has not loaded. Placement per plan section 5.
 */

interface DisclaimerProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** SHORT_DISCLAIMER as plain small text (end of the catalog list, Legal screen). */
export function ShortDisclaimer({ style, testID }: DisclaimerProps) {
  const { legal } = useConfig();
  return (
    <AppText variant="caption" color="textMuted" style={style} testID={testID}>
      {legal.short}
    </AppText>
  );
}

/** The full LEGAL_DISCLAIMER box (src/components/Disclaimer.tsx): settlement page, Legal screen. */
export function LegalDisclaimer({ style, testID }: DisclaimerProps) {
  const { legal } = useConfig();
  return <DisclaimerBox text={legal.disclaimer} style={style} testID={testID} />;
}

/** The compact box (Disclaimer compact): four lines and "Show all". Claim screen and dashboard footers. */
export function CompactDisclaimer({ style, testID }: DisclaimerProps) {
  const { legal } = useConfig();
  const [expanded, setExpanded] = useState(false);
  return (
    <DisclaimerBox text={legal.disclaimer} numberOfLines={expanded ? undefined : 4} style={style} testID={testID}>
      {expanded ? null : (
        <Button
          label={shared.showAll.text}
          variant="ghost"
          bleed="start"
          onPress={() => setExpanded(true)}
          accessibilityState={{ expanded: false }}
          style={styles.showAll}
          testID={testID ? `${testID}-show-all` : undefined}
        />
      )}
    </DisclaimerBox>
  );
}

function DisclaimerBox({
  text,
  numberOfLines,
  children,
  style,
  testID,
}: {
  text: string;
  numberOfLines?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.box, style]} testID={testID}>
      <View style={styles.heading}>
        <Icon icon={Info} size="sm" color="infoIcon" />
        <AppText variant="label" accessibilityRole="header" style={styles.headingText}>
          {shared.legalDisclaimerTitle.text}
        </AppText>
      </View>
      {/* Screen readers read the whole text even while it is cut to four lines. */}
      <AppText variant="caption" color="textMuted" numberOfLines={numberOfLines}>
        {text}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space[2],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    // "Show all" reaches past this padding (Button bleed): its pressed color stops at the box's edge.
    overflow: 'hidden',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  headingText: {
    flexShrink: 1,
  },
  showAll: {
    alignSelf: 'flex-start',
  },
});
