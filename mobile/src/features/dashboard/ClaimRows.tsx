import { CLAIM_GROUP_LABELS, type ClaimGroup } from '@shared/lib/claims';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, SectionHeader } from '@/components/ui';
import { ArrowRight, FileSearch } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { common } from '@/copy/common';
import { dashboard, groupHint, nextStepText } from '@/copy/dashboard';
import { fillCopy } from '@/copy/shared';
import { ClaimStatusBadge, isClaimHref } from '@/features/shared';
import { space } from '@/theme/tokens';

import { DashedCard, SectionError } from './parts';
import type { DashboardRow } from './types';

/**
 * "Your claims", grouped by next step (src/components/claims/ClaimList.tsx).
 * The screen's list renders the header, each group's heading and each row as
 * its own item, so a long list of claims scrolls without rendering them all.
 */

/** "Your claims" and how the list is grouped. */
export function ClaimsHeader() {
  return <SectionHeader title={dashboard.claimsTitle.text} description={dashboard.claimsIntro.text} />;
}

/** claims.failed: the claims could not be read. Nothing is guessed. */
export function ClaimsFailed({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <SectionError title={dashboard.claimsFailedTitle.text} body={dashboard.claimsFailedBody.text} testID="dashboard-claims-failed">
      <Button label={common.tryAgain.text} variant="secondary" loading={retrying} onPress={onRetry} style={styles.retry} />
    </SectionError>
  );
}

/** No claims yet: what ClaimMatch is for, and the way to the list. */
export function ClaimsEmpty({ onBrowse }: { onBrowse: () => void }) {
  return (
    <DashedCard testID="dashboard-claims-empty">
      <EmptyState
        icon={FileSearch}
        title={dashboard.noClaimsTitle.text}
        body={dashboard.noClaimsBody.text}
        style={styles.empty}
        action={<Button label={app.browseOpenSettlements.text} icon={ArrowRight} iconPosition="trailing" onPress={onBrowse} />}
      />
    </DashedCard>
  );
}

/** "Needs filing (3)" and its hint. */
export function ClaimGroupHeader({ group, count }: { group: ClaimGroup; count: number }) {
  return (
    <View style={styles.groupHeader} testID={`claims-group-${group}`}>
      <AppText variant="bodyStrong" accessibilityRole="header">{`${CLAIM_GROUP_LABELS[group]} (${count})`}</AppText>
      <AppText variant="caption" color="textMuted">
        {groupHint(group)}
      </AppText>
    </View>
  );
}

/**
 * One claim: title, status (displayClaimStatus, via the server), deadline,
 * next step, and its action ("How to file", "Tell us", "Add number",
 * "View"), which opens the claim. An action whose href is not
 * "/claim/{slug}" is not shown.
 */
export function ClaimRowCard({ row, onOpen }: { row: DashboardRow; onOpen: (href: unknown) => void }) {
  const action = row.action && isClaimHref(row.action.href) ? row.action : null;
  return (
    <Card padding={4} style={styles.card} testID={`claim-row-${row.claimId}`}>
      <AppText variant="bodyStrong">{row.title}</AppText>
      <View style={styles.meta}>
        <ClaimStatusBadge label={row.label} tone={row.tone} />
        <AppText variant="caption" color="textMuted" style={styles.shrink}>
          {row.deadlineText}
        </AppText>
      </View>
      <AppText variant="caption" color="textMuted">
        {nextStepText(row.nextStep)}
      </AppText>
      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          icon={ArrowRight}
          iconPosition="trailing"
          accessibilityLabel={fillCopy(dashboard.actionFor.text, { label: action.label, title: row.title })}
          onPress={() => onOpen(action.href)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  retry: {
    alignSelf: 'flex-start',
    marginTop: space[2],
  },
  empty: {
    paddingVertical: space[2],
  },
  groupHeader: {
    gap: space[1],
  },
  card: {
    gap: space[2],
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space[3],
    rowGap: space[1],
  },
  shrink: {
    flexShrink: 1,
  },
});
