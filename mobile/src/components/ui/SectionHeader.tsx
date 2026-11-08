import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { space, touchTarget, typography, type TextColorToken } from '@/theme/tokens';

import { AppText } from './AppText';
import { BUTTON_PADDING_X } from './Button';
import { STACK_VALUE_FONT_SCALE } from './ListItem';

/**
 * How far a button (at least touchTarget + 4 tall) reaches above and below a
 * one-line heading beside it. Taken out of the layout, so the row keeps the
 * heading's height and the two line up on their centers.
 */
const ACTION_OVERHANG = (touchTarget + 4 - (typography.heading.lineHeight ?? touchTarget)) / 2;

export interface SectionHeaderProps {
  title: string;
  /** Optional line under the title. */
  description?: string;
  /** Color of the description (default: the caption color). */
  descriptionColor?: TextColorToken;
  /** Optional action, such as a small ghost Button. */
  action?: ReactNode;
  /**
   * 'beside' (default): beside the title and centered on it, reaching past
   * the title's line; it suits a short borderless action, and moves under the
   * description at large text sizes. 'below': under the description at every
   * size, for a wide or outlined button that would crowd the title.
   */
  actionPlacement?: 'beside' | 'below';
  /**
   * The action is a ghost Button: its label lines up with the title's end
   * (beside) or the description's start (below), as Button's bleed does.
   */
  actionBleed?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Heading above a group of content; announced as a header. */
export function SectionHeader({
  title,
  description,
  descriptionColor,
  action,
  actionPlacement = 'beside',
  actionBleed = false,
  style,
  testID,
}: SectionHeaderProps) {
  const { fontScale } = useWindowDimensions();
  const actionBeside = action != null && actionPlacement === 'beside' && fontScale < STACK_VALUE_FONT_SCALE;
  return (
    <View style={[styles.header, style]} testID={testID}>
      <View style={styles.titleRow} testID={testID ? `${testID}-title-row` : undefined}>
        <AppText variant="heading" style={styles.title}>
          {title}
        </AppText>
        {actionBeside ? (
          <View
            style={[styles.actionBeside, actionBleed ? styles.bleedEnd : null]}
            testID={testID ? `${testID}-action-beside` : undefined}
          >
            {action}
          </View>
        ) : null}
      </View>
      {description ? (
        <AppText variant="caption" color={descriptionColor}>
          {description}
        </AppText>
      ) : null}
      {action != null && !actionBeside ? (
        <View
          style={[styles.actionBelow, actionBleed ? styles.bleedStart : null]}
          testID={testID ? `${testID}-action-below` : undefined}
        >
          {action}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  title: {
    flex: 1,
  },
  actionBeside: {
    flexShrink: 0,
    marginVertical: -ACTION_OVERHANG,
  },
  actionBelow: {
    alignSelf: 'flex-start',
    marginTop: space[2],
  },
  bleedStart: {
    marginStart: -BUTTON_PADDING_X,
  },
  bleedEnd: {
    marginEnd: -BUTTON_PADDING_X,
  },
});
