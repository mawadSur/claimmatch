import type { ClaimFlowSettlement, PacketProfile } from '@shared/lib/claim-screen';
import type { ClaimView, ProofNeed, SettlementContext } from '@shared/lib/claims';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Notice, TextLink } from '@/components/ui';
import { ExternalLink } from '@/components/ui/icons';
import { claim as copy, listingSourceSentence, stepHeadingLabel } from '@/copy/claim';
import { common } from '@/copy/common';
import { ExternalTextLink, UnverifiedBadge, useHostLabels } from '@/features/shared';
import { toSafeWebUrl } from '@/lib/external-link';
import { colors, radii, space } from '@/theme/tokens';

import { Bullet, Bullets } from './Bullets';
import { FlowTarget, useFlowTargetsApi } from './flow-targets';
import { PrefillPacket } from './PrefillPacket';
import { ReportFiled } from './ReportFiled';
import { useOfficialFormOpener } from './use-official-form';
import type { OnClaimChange } from './use-claim-writes';

const PROOF_TEXT: Record<ProofNeed, string> = {
  required: copy.proofRequired.text,
  optional: copy.proofOptional.text,
  none: copy.proofNone.text,
  unknown: copy.proofUnknown.text,
};

/** A note on a light panel inside a card (the web's rounded-xl bg-gray-50 px-4 py-3). */
function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <AppText variant="caption" color="textMuted">
      {children}
    </AppText>
  );
}

/** One numbered step: the number and title, then the step's content. */
function Step({ n, title, children, testID }: { n: number; title: string; children: ReactNode; testID?: string }) {
  return (
    <Card style={styles.step} testID={testID}>
      <View style={styles.stepHeader}>
        <View style={styles.number} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <AppText variant="label" color="onSelected">
            {n}
          </AppText>
        </View>
        <AppText variant="heading" accessibilityLabel={stepHeadingLabel(n, title)} style={styles.stepTitle}>
          {title}
        </AppText>
      </View>
      {children}
    </Card>
  );
}

/**
 * Shown above the steps while our list marks the settlement closed or no
 * longer lists it (ClaimFlow.tsx Caveat); nothing otherwise.
 */
export function Caveat({ context }: { context: SettlementContext }) {
  let text: string | null = null;
  if (context.closedByStatus) {
    text = context.deadline ? copy.caveatClosedWithDeadline.text : copy.caveatClosed.text;
  } else if (context.known && !context.published) {
    text = copy.caveatUnlisted.text;
  }
  if (!text) return null;
  return <Notice tone="unverified" body={text} testID="claim-caveat" />;
}

/** Step 2 without an official link (ClaimFlow.tsx NoOfficialLink). */
function NoOfficialLink({ settlement }: { settlement: ClaimFlowSettlement }) {
  const hostLabels = useHostLabels();
  const middle = settlement.sourceUrl ? listingSourceSentence(settlement.sourceHost) : copy.useNoticeLink.text;
  return (
    <View style={styles.tight}>
      <Muted>{[copy.noOfficialSite.text, middle, copy.onlyFileNamed.text].join(' ')}</Muted>
      {settlement.sourceUrl ? (
        <ExternalTextLink
          url={settlement.sourceUrl}
          {...(settlement.sourceHost ? hostLabels(settlement.sourceHost) : { label: copy.thisSource.text })}
        />
      ) : null}
    </View>
  );
}

export interface FilingStepsProps {
  settlement: ClaimFlowSettlement;
  context: SettlementContext;
  claim: ClaimView | null;
  profile: PacketProfile | null;
  onChange: OnClaimChange;
}

/**
 * The three steps (ClaimFlow.tsx FilingSteps): (1) check you qualify, (2) file
 * on the official site, (3) tell us you filed. ClaimMatch never files: the
 * official form opens in the in-app browser, and when it closes the screen
 * scrolls to Step 3. Each step is its own child of the scroll content.
 *
 * Assisted filing (ASSISTED_FILING_ENABLED) is not in the app (plan 7, item
 * 6): Step 2 is always the self-file step, which never says ClaimMatch files.
 */
export function FilingSteps({ settlement, context, claim, profile, onChange }: FilingStepsProps) {
  const router = useRouter();
  const targets = useFlowTargetsApi();
  const openOfficialForm = useOfficialFormOpener(() => targets?.reveal('step3'));
  const officialUrl = toSafeWebUrl(settlement.officialUrl);

  return (
    <>
      <Step n={1} title={copy.step1Title.text} testID="claim-step-1">
        {settlement.eligibility ? (
          <View style={styles.tight}>
            <Muted>{copy.listingSays.text}</Muted>
            <Panel>
              <AppText variant="caption" color="text">
                {settlement.eligibility}
              </AppText>
            </Panel>
            <Muted>{copy.shortSummary.text}</Muted>
          </View>
        ) : (
          <Muted>{copy.noRules.text}</Muted>
        )}
        <Muted>{copy.readNotice.text}</Muted>
        {officialUrl ? (
          <ExternalTextLink url={officialUrl} label={copy.readRules.text} />
        ) : (
          <Muted>{copy.noNoticeLink.text}</Muted>
        )}
        <View style={styles.tight}>
          <UnverifiedBadge />
          <AppText variant="caption" color="textMuted">
            {copy.notChecked.text}
          </AppText>
        </View>
      </Step>

      <Step n={2} title={copy.step2Title.text} testID="claim-step-2">
        {officialUrl ? (
          <View style={styles.tight}>
            <Button
              label={copy.openClaimForm.text}
              icon={ExternalLink}
              iconPosition="trailing"
              accessibilityRole="link"
              accessibilityHint={common.opensInBrowserHint.text}
              onPress={() => void openOfficialForm(officialUrl)}
              fullWidth
              testID="claim-open-official-form"
            />
            <Muted>{copy.opensInBrowser.text}</Muted>
          </View>
        ) : (
          <NoOfficialLink settlement={settlement} />
        )}
        <View style={styles.tight}>
          <AppText variant="label" accessibilityRole="header">
            {copy.whatYoullNeed.text}
          </AppText>
          <Bullets>
            <Bullet>
              <Muted>{copy.needDetails.text}</Muted>
            </Bullet>
            <Bullet>
              <Muted>{PROOF_TEXT[settlement.proof]}</Muted>
            </Bullet>
            <Bullet>
              <Muted>{copy.needNoticeId.text}</Muted>
            </Bullet>
          </Bullets>
        </View>
        <Panel>
          <Muted>{copy.filingIsFree.text}</Muted>
        </Panel>
        <PrefillPacket profile={profile} formFieldOrder={settlement.formFieldOrder} />
      </Step>

      <FlowTarget name="step3" testID="claim-step-3-target">
        <Step n={3} title={copy.step3Title.text} testID="claim-step-3">
          <View style={styles.tight}>
            <Muted>{copy.keepTogether.text}</Muted>
            <TextLink label={copy.goToYourClaims.text} onPress={() => router.dismissTo('/dashboard')} />
          </View>
          <ReportFiled
            lawsuitId={settlement.id}
            claim={claim}
            context={context}
            allowSave={context.openForClaims}
            onChange={onChange}
          />
        </Step>
      </FlowTarget>
    </>
  );
}

const styles = StyleSheet.create({
  step: {
    gap: space[4],
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  number: {
    // Grows with Dynamic Type instead of clipping the digit.
    minWidth: space[8],
    minHeight: space[8],
    paddingHorizontal: space[2],
    borderRadius: radii.full,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    flex: 1,
  },
  tight: {
    gap: space[2],
  },
  panel: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.xl,
    backgroundColor: colors.background,
  },
});
