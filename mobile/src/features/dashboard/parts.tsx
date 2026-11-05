import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Icon, Notice, SectionHeader } from '@/components/ui';
import type { LucideIcon } from '@/components/ui/icons';
import { colors, radii, space } from '@/theme/tokens';

/**
 * Small building blocks shared by the dashboard's sections: the dashed
 * empty-state card, the brand icon tile, the reasons list and a section's
 * load error. In-app text links are the kit's TextLink.
 */

/**
 * A section's title with its action beside it (wrapping under it at large
 * text sizes), and the description across the full width below: a long
 * description next to a button would be squeezed into a narrow column.
 */
export function SectionTitle({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <SectionHeader title={title} action={action} />
      <AppText variant="caption" color="textMuted">
        {description}
      </AppText>
    </View>
  );
}

/** The web's dashed white box for an empty list (border-dashed, rounded-2xl). */
export function DashedCard({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.dashed, style]} testID={testID}>
      {children}
    </View>
  );
}

/** The 40 pt brand tile behind a decorative icon (grid h-10 w-10 rounded-xl bg-brand-100). */
export function IconTile({ icon }: { icon: LucideIcon }) {
  return (
    <View style={styles.tile}>
      <Icon icon={icon} size="md" color="textLink" />
    </View>
  );
}

/** A bulleted list of short lines (a match's reasons). The bullets are not read aloud. */
export function BulletList({ items, testID }: { items: readonly string[]; testID?: string }) {
  return (
    <View style={styles.bullets} testID={testID}>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} style={styles.bulletRow}>
          <AppText variant="caption" color="textMuted" accessible={false} importantForAccessibility="no">
            {'•'}
          </AppText>
          <AppText variant="caption" color="textMuted" style={styles.bulletText}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * A section that could not load (the web's role="alert" box), with an
 * optional way on. Part of the screen as it loads, so it is not announced
 * (a list row scrolled back into view would announce it again).
 */
export function SectionError({
  title,
  body,
  children,
  testID,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Notice tone="error" title={title} body={body} announce={false} testID={testID}>
      {children}
    </Notice>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    gap: space[1],
  },
  dashed: {
    gap: space[4],
    padding: space[5],
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderBrand,
    backgroundColor: colors.surface,
  },
  tile: {
    width: space[10],
    height: space[10],
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bullets: {
    gap: space[1],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: space[2],
  },
  bulletText: {
    flex: 1,
  },
});
