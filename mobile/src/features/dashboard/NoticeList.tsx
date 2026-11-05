import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, type HostInstance } from 'react-native';

import { AppText, Button, Icon, Notice } from '@/components/ui';
import { TriangleAlert } from '@/components/ui/icons';
import {
  gotItForAllLabel,
  NOTICE_PREVIEW,
  noticeListBody,
  noticeListTitle,
  showAllNoticesLabel,
} from '@/copy/notices';
import { colors, radii, space, typography } from '@/theme/tokens';

import { NoticeRow } from './NoticeRow';
import type { NoticeAnswersState } from './use-notice-answers';

export interface NoticeListProps {
  state: NoticeAnswersState;
}

/**
 * The dashboard's corrective notice (D42, CorrectiveNoticeList): one row per
 * legacy claim the old flow called "filed", each with one-tap answers, and a
 * "not real" row per claim on a fictional settlement, with "Got it for all"
 * when there are several. The first NOTICE_PREVIEW rows show until
 * "Show all". Answered rows keep their confirmation until the screen is left.
 */
export function NoticeList({ state }: NoticeListProps) {
  const { rows, answers, busy, errors, openFictional, bulk, showAll } = state;
  const firstRevealed = useRef<HostInstance>(null);

  // "Show all" disappears once used: move screen-reader focus to the first row it revealed.
  useEffect(() => {
    if (showAll && firstRevealed.current) AccessibilityInfo.sendAccessibilityEvent(firstRevealed.current, 'focus');
  }, [showAll]);

  if (rows.length === 0) return null;
  const legacyCount = rows.filter((row) => row.kind === 'legacy').length;
  const body = noticeListBody(legacyCount);
  const visible = showAll ? rows : rows.slice(0, NOTICE_PREVIEW);
  const hidden = rows.length - visible.length;

  return (
    <View style={styles.card} testID="dashboard-notices">
      <View style={styles.titleRow}>
        <View style={styles.titleIcon}>
          <Icon icon={TriangleAlert} size="md" color="warningIcon" />
        </View>
        <AppText variant="heading" color="warning" accessibilityRole="header" style={styles.titleText}>
          {noticeListTitle(legacyCount)}
        </AppText>
      </View>
      {body ? (
        <AppText variant="caption" color="warning">
          {body}
        </AppText>
      ) : null}

      {bulk.done ? <Notice tone="success" body={bulk.done} testID="dashboard-notices-done" /> : null}
      {openFictional.length > 1 ? (
        <Button
          label={gotItForAllLabel(openFictional.length)}
          variant="secondary"
          loading={bulk.busy}
          onPress={state.acknowledgeAllFictional}
        />
      ) : null}
      {bulk.error ? <Notice tone="error" body={bulk.error} testID="dashboard-notices-error" /> : null}

      <View style={styles.rows}>
        {visible.map((item, index) => (
          <NoticeRow
            key={item.claimId}
            item={item}
            answer={answers[item.claimId]}
            busy={busy[item.claimId]}
            error={errors[item.claimId]}
            onAnswer={state.answer}
            onNumberSaved={state.numberSaved}
            focusRef={index === NOTICE_PREVIEW ? firstRevealed : undefined}
          />
        ))}
      </View>
      {hidden > 0 ? (
        <Button
          label={showAllNoticesLabel(rows.length)}
          variant="ghost"
          accessibilityState={{ expanded: false }}
          onPress={state.revealAll}
          style={styles.showAll}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
    padding: space[5],
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSurface,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  titleIcon: {
    // Centers the icon on the first line of the heading.
    minHeight: typography.heading.lineHeight,
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
  },
  rows: {
    gap: space[3],
  },
  showAll: {
    alignSelf: 'flex-start',
  },
});
