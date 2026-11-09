import type { FaqItem } from '@shared/lib/settlement-seo';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { ChevronDown, ChevronUp, CircleQuestionMark } from '@/components/ui/icons';
import { settlement } from '@/copy/settlement';
import { colors, iconSizes, radii, shadows, space } from '@/theme/tokens';

/**
 * "Frequently asked questions" (src/components/settlement/SettlementFaq.tsx)
 * from settlementFaqs: each question is a row that shows or hides its
 * answer, collapsed at first like the web's <details>. Screen readers hear
 * the question as a button that is expanded or collapsed.
 */
export function SettlementFaq({ items, testID }: { items: FaqItem[]; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <AppText variant="title">{settlement.faqTitle.text}</AppText>
      <View style={styles.items}>
        {items.map((item) => (
          <FaqRow key={item.q} item={item} />
        ))}
      </View>
    </View>
  );
}

function FaqRow({ item }: { item: FaqItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.q}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((shown) => !shown)}
        style={({ pressed }) => [
          styles.question,
          expanded ? styles.questionExpanded : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Icon icon={CircleQuestionMark} size="md" color="textLink" />
        <AppText variant="bodyStrong" style={styles.questionText}>
          {item.q}
        </AppText>
        <Icon icon={expanded ? ChevronUp : ChevronDown} size="sm" color="textSoft" />
      </Pressable>
      {expanded ? (
        <AppText variant="caption" color="textMuted" style={styles.answer}>
          {item.a}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[4],
  },
  items: {
    gap: space[3],
  },
  row: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  question: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    padding: space[5],
    // The pressed fill follows the card's rounded corners.
    borderRadius: radii['2xl'],
  },
  questionExpanded: {
    paddingBottom: space[2],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  questionText: {
    flex: 1,
  },
  answer: {
    paddingHorizontal: space[5],
    paddingBottom: space[5],
    // Lines up with the question text, after the icon (the web's pl-7).
    paddingLeft: space[5] + iconSizes.md + space[2],
  },
});
