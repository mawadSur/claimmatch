import type { ClaimFlowSettlement } from '@shared/lib/claim-screen';
import {
  canReportWithoutClaim,
  claimActionAvailability,
  lateReportLastDay,
  reportByDay,
  type ClaimView,
  type SettlementContext,
} from '@shared/lib/claims';
import { formatDeadline } from '@shared/lib/utils';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Divider } from '@/components/ui';
import { claim as copy, deadlinePassedSentence, forUpdatesSentence, recheckingSentence } from '@/copy/claim';
import { ExternalTextLink } from '@/features/shared';
import { space } from '@/theme/tokens';

import { ReportFiled } from './ReportFiled';
import type { OnClaimChange } from './use-claim-writes';

export interface NoLongerOpenProps {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView | null;
  onChange: OnClaimChange;
}

/**
 * After the deadline, or (no claim when the screen loaded) a listing our list
 * marks closed (ClaimFlow.tsx NoLongerOpen). People who filed can still tell
 * us until 30 days after the deadline.
 */
export function NoLongerOpen({ settlement, context, claim, onChange }: NoLongerOpenProps) {
  const passed = context.deadlinePassed;
  const official = settlement.officialUrl;
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : canReportWithoutClaim(context);
  const lastDay = claim ? reportByDay(claim, settlement.deadline) : lateReportLastDay(settlement.deadline);
  const text = passed
    ? deadlinePassedSentence(formatDeadline(settlement.deadline), canReport, lastDay ? formatDeadline(lastDay) : null)
    : recheckingSentence(Boolean(official));

  return (
    <Card style={styles.card} testID="claim-no-longer-open">
      <AppText variant="heading">{passed ? copy.deadlinePassedTitle.text : copy.closedOnListTitle.text}</AppText>
      <View style={styles.tight}>
        <AppText variant="caption" color="textMuted">
          {text}
        </AppText>
        {!passed && official ? <ExternalTextLink url={official} label={copy.officialSite.text} /> : null}
      </View>
      <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
      {passed && official ? (
        <View style={styles.tight}>
          <Divider />
          <AppText variant="caption" color="textMuted">
            {forUpdatesSentence()}
          </AppText>
          <ExternalTextLink url={official} label={copy.officialSite.text} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  tight: {
    gap: space[2],
  },
});
