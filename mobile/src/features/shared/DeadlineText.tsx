import { daysUntilDeadline, deadlineCountdown } from '@shared/lib/claim-deadlines';
import { formatDeadline } from '@shared/lib/utils';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Badge, Icon, type BadgeTone } from '@/components/ui';
import { CalendarClock } from '@/components/ui/icons';
import { shared } from '@/copy/shared';
import { space } from '@/theme/tokens';

import { useNow } from './use-now';

export interface DeadlineTextProps {
  /** YYYY-MM-DD, or null when the listing has none. */
  deadline: string | null | undefined;
  /** Defaults to useNow(). */
  now?: Date;
  /** Shown without a deadline (default: "We don’t have a deadline listed. Check the official notice."). */
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Gray once passed, red in the last two weeks, brand otherwise (ClaimFlow StatusPanel). */
function countdownTone(days: number | null): BadgeTone {
  if (days === null || days < 0) return 'gray';
  return days <= 14 ? 'red' : 'brand';
}

/**
 * A deadline with its countdown, as the claim flow's StatusPanel shows it:
 * "Oct 15, 2026" and "12 days left" (formatDeadline and deadlineCountdown,
 * counted in America/New_York days). Read as one phrase by screen readers.
 */
export function DeadlineText({ deadline, now, emptyText = shared.noDeadlineListed.text, style, testID }: DeadlineTextProps) {
  const today = useNow();
  if (!deadline) {
    return (
      <AppText variant="caption" color="textMuted" style={style} testID={testID}>
        {emptyText}
      </AppText>
    );
  }
  const at = now ?? today;
  const date = formatDeadline(deadline);
  const countdown = deadlineCountdown(deadline, at);
  return (
    <View
      accessible
      accessibilityLabel={countdown ? `${date}, ${countdown}` : date}
      style={[styles.row, style]}
      testID={testID}
    >
      <Icon icon={CalendarClock} size="sm" color="textLink" />
      <AppText variant="label">{date}</AppText>
      {countdown ? <Badge label={countdown} tone={countdownTone(daysUntilDeadline(deadline, at))} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[2],
  },
});
