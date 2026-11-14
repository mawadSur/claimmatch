import type { CatalogLink } from '@shared/lib/lawsuit-display';
import { formatDeadline } from '@shared/lib/utils';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Divider, ExternalLinkButton, Icon } from '@/components/ui';
import { ArrowRight, CircleCheck } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { settlement } from '@/copy/settlement';
import { shared } from '@/copy/shared';
import { space, typography } from '@/theme/tokens';

export interface SettlementNextStepsProps {
  open: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  official: CatalogLink | null;
  /** Signed in: "You’ll sign in or create a free account first." does not apply. */
  signedIn: boolean;
  onStartClaim(): void;
  onBrowse(): void;
  testID?: string;
}

const CHECKLIST = [
  settlement.checklistFileYourself.text,
  settlement.checklistNeverFiles.text,
  settlement.checklistSaveNumber.text,
] as const;

/**
 * The web page's sidebar, shown inline near the end (plan 3.3): while open,
 * "Check if you qualify" with the claim buttons, the official site and what
 * Lawsuit AI does and does not do; once closed, "Claims closed" with what
 * that means and a way back to the open settlements.
 */
export function SettlementNextSteps({
  open,
  deadline,
  deadlinePassed,
  official,
  signedIn,
  onStartClaim,
  onBrowse,
  testID,
}: SettlementNextStepsProps) {
  if (!open) {
    const notTaking =
      deadlinePassed && deadline
        ? `${settlement.closedNotTaking.text} ${settlement.closedDeadlineWas.text} ${formatDeadline(deadline)}.`
        : settlement.closedNotTaking.text;
    return (
      <Card style={styles.card} testID={testID}>
        <AppText variant="heading">{shared.claimsClosed.text}</AppText>
        <AppText variant="caption" color="textMuted">
          {`${notTaking} ${settlement.closedMayPayAutomatically.text}`}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {settlement.closedAlreadyFiled.text}
        </AppText>
        <Button
          label={app.browseOpenSettlements.text}
          variant="secondary"
          icon={ArrowRight}
          iconPosition="trailing"
          onPress={onBrowse}
          fullWidth
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card} testID={testID}>
      <AppText variant="heading">{settlement.checkIfYouQualify.text}</AppText>
      <AppText variant="caption" color="textMuted">
        {settlement.sidebarOpenBody.text}
      </AppText>
      <View style={styles.actions}>
        <Button
          label={settlement.checkIfYouQualify.text}
          icon={ArrowRight}
          iconPosition="trailing"
          onPress={onStartClaim}
          fullWidth
        />
        <Button
          label={settlement.startYourClaim.text}
          variant="secondary"
          icon={ArrowRight}
          iconPosition="trailing"
          onPress={onStartClaim}
          fullWidth
        />
        {signedIn ? null : (
          <AppText variant="caption" color="textMuted" align="center">
            {settlement.signInFirst.text}
          </AppText>
        )}
        {official?.kind === 'official' ? (
          <ExternalLinkButton url={official.href} label={shared.goToOfficialSite.text} fullWidth />
        ) : null}
      </View>
      <Divider />
      <View style={styles.checklist}>
        {CHECKLIST.map((line) => (
          <View key={line} style={styles.checkItem}>
            <View style={styles.checkIcon}>
              <Icon icon={CircleCheck} size="sm" color="successIcon" />
            </View>
            <AppText variant="caption" color="textMuted" style={styles.checkText}>
              {line}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  actions: {
    gap: space[3],
  },
  checklist: {
    gap: space[2],
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  checkIcon: {
    // Centers the icon on the first line of caption text.
    minHeight: typography.caption.lineHeight,
    justifyContent: 'center',
  },
  checkText: {
    flex: 1,
  },
});
