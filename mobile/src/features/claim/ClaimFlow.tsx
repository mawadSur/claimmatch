import type { ClaimFlowSettlement } from '@shared/lib/claim-screen';
import {
  displayClaimStatus,
  legacyFilingState,
  type ClaimView,
  type SettlementContext,
} from '@shared/lib/claims';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Card, Divider, Notice, Skeleton } from '@/components/ui';
import { checkOnClaimSentence, claim as copy } from '@/copy/claim';
import { filing as filingCopy } from '@/copy/filing';
import type { FlowClaimScreen } from '@/data/claims';
import { FilingTimeline, OneClickEntry, OneClickFiling, PreparedAnswers, hasOneClickHistory, useOneClick } from '@/features/filing';
import { ExternalTextLink } from '@/features/shared';
import { space } from '@/theme/tokens';

import { Caveat, FilingSteps } from './FilingSteps';
import { FlowTarget, useFlowTargetsApi, useFocusNode, type FlowTargetName } from './flow-targets';
import { NoLongerOpen } from './NoLongerOpen';
import { CorrectiveNotice, FictionalNotice } from './Notices';
import { ReportFiled } from './ReportFiled';
import { StatusPanel } from './StatusPanel';
import type { OnClaimChange } from './use-claim-writes';

interface Announcement {
  message: string;
  /** Where screen-reader focus goes: the message, or the "Your claim" card after a report. */
  focus: FlowTargetName;
}

/** "Your claim" once the claim is reported or submitted (ClaimFlow.tsx). */
function YourClaimCard({
  settlement,
  context,
  claim,
  onChange,
  history,
}: {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView;
  onChange: OnClaimChange;
  /** The one-click history of a claim that went through one-click filing. */
  history?: ReactNode;
}) {
  const headingRef = useFocusNode('yourClaim');
  return (
    <FlowTarget name="yourClaim" testID="claim-your-claim">
      <Card style={styles.card}>
        {/* The view is the heading screen readers land on after a report (the web focuses its h2). */}
        <View ref={headingRef} accessible accessibilityRole="header" accessibilityLabel={copy.yourClaim.text}>
          <AppText variant="heading" accessible={false}>
            {copy.yourClaim.text}
          </AppText>
        </View>
        <ReportFiled lawsuitId={settlement.id} claim={claim} context={context} allowSave={false} onChange={onChange} />
        {history}
        {settlement.officialUrl ? (
          <View style={styles.tight}>
            <Divider />
            <AppText variant="caption" color="textMuted">
              {checkOnClaimSentence()}
            </AppText>
            <ExternalTextLink url={settlement.officialUrl} label={copy.officialSite.text} />
          </View>
        ) : null}
      </Card>
    </FlowTarget>
  );
}

export interface ClaimFlowProps {
  data: FlowClaimScreen;
  /** Whether the user had a claim when the screen last loaded (the web's initialClaim). */
  claimAtLoad: boolean;
}

/**
 * The claim flow (src/components/claims/ClaimFlow.tsx): status and deadline,
 * the confirmation of the last change, then one of the notices, the "Your
 * claim" card, the no-longer-open card or the three filing steps. The claim
 * itself comes from the cached screen, which every write updates with the
 * server's answer. Renders the scroll content's children directly, so they
 * can be scrolled to.
 */
export function ClaimFlow({ data, claimAtLoad }: ClaimFlowProps) {
  const { settlement, context, claim, profile } = data;
  const targets = useFlowTargetsApi();
  const now = useMemo(() => new Date(data.now), [data.now]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const display = claim ? displayClaimStatus(claim, context) : null;
  const reported = claim?.status === 'reported_filed' || display?.kind === 'submitted';

  const onChange = useCallback<OnClaimChange>((_next, message, options) => {
    if (!message) return;
    setAnnouncement({ message, focus: options?.reported ? 'yourClaim' : 'announcement' });
  }, []);
  const announce = useCallback((message: string) => setAnnouncement({ message, focus: 'announcement' }), []);
  // One-click filing (ONE_CLICK_FILING_ENABLED): null while it is off, and the screen is as before.
  const oc = useOneClick(data, announce);
  const history = oc?.view && hasOneClickHistory(oc.view) ? <FilingTimeline entries={oc.view.timeline} /> : null;

  // Show the confirmation and move focus: to the "Your claim" card after a
  // report (whose form is gone), else to the confirmation itself.
  useEffect(() => {
    if (!announcement) return;
    targets?.reveal('announcement', announcement.focus);
    if (announcement.focus !== 'announcement') {
      AccessibilityInfo.announceForAccessibilityWithOptions(announcement.message, { queue: true });
    }
  }, [announcement, targets]);

  let body: ReactNode;
  if (context.fictional && claim) {
    body = (
      <FictionalNotice
        claimId={claim.id}
        title={settlement.title}
        acknowledged={!display?.showNotice}
        onAcknowledged={onChange}
      />
    );
  } else if (claim && display?.legacy && display.showNotice) {
    body = (
      <CorrectiveNotice
        claimId={claim.id}
        deadline={settlement.deadline}
        filing={legacyFilingState(context)}
        officialUrl={settlement.officialUrl}
        onAnswered={onChange}
      />
    );
  } else if (oc?.active) {
    body = oc.view ? (
      <OneClickFiling view={oc.view} onView={oc.onView} nextEasySubmit={oc.nextEasySubmit} />
    ) : oc.loadFailed ? (
      <Notice tone="error" body={filingCopy.loadFailed.text} testID="filing-load-failed" />
    ) : (
      <Skeleton height={160} />
    );
  } else if (claim && reported) {
    body = <YourClaimCard settlement={settlement} context={context} claim={claim} onChange={onChange} history={history} />;
  } else if (context.deadlinePassed || (!claimAtLoad && !context.openForClaims)) {
    // After the deadline; or, with no claim when the screen loaded, a listing
    // our list marks closed (D41: still being re-checked). Keyed on the claim
    // at load, so the form stays in place while "I filed my claim" starts it.
    body = <NoLongerOpen settlement={settlement} context={context} claim={claim} onChange={onChange} />;
  } else {
    body = (
      <>
        <Caveat context={context} />
        {oc?.offerStart ? <OneClickEntry lawsuitId={settlement.id} lane={oc.lane} onStarted={oc.onView} /> : null}
        <FilingSteps
          settlement={settlement}
          context={context}
          claim={claim}
          profile={profile}
          onChange={onChange}
          stepTwoTitle={oc ? filingCopy.selfFileTitle.text : undefined}
          stepTwoLead={oc?.reasons}
          agentLane={Boolean(oc?.offerStart || oc?.lane?.agent)}
          prepared={
            oc?.handedBack ? (
              <>
                <PreparedAnswers view={oc.handedBack} />
                {hasOneClickHistory(oc.handedBack) ? <FilingTimeline entries={oc.handedBack.timeline} /> : null}
              </>
            ) : null
          }
        />
      </>
    );
  }

  return (
    <>
      <StatusPanel
        display={display}
        deadline={settlement.deadline}
        now={now}
        fictional={context.fictional}
        badge={oc?.badge}
        note={oc?.note}
      />
      {announcement ? (
        <FlowTarget
          name="announcement"
          focusable
          accessible
          accessibilityLabel={announcement.message}
          testID="claim-announcement"
        >
          {/* Read once, through the label above (Android would otherwise read the box twice). */}
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Notice tone="success" body={announcement.message} announce={false} />
          </View>
        </FlowTarget>
      ) : null}
      {body}
    </>
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
