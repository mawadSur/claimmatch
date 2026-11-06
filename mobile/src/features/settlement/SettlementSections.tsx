import type { CatalogLink } from '@shared/lib/lawsuit-display';
import { proofDetail } from '@shared/lib/proof';
import { settlementProofDetail } from '@shared/lib/settlement-guides';
import { formatDeadline } from '@shared/lib/utils';
import { displayProofLabel } from '@shared/lib/verified-fields';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Divider } from '@/components/ui';
import { settlement } from '@/copy/settlement';
import type { CatalogLawsuit } from '@/data/catalog';
import { ExternalTextLink } from '@/features/shared';
import { colors, fontFamilies, radii, space } from '@/theme/tokens';

import { Fact } from './Fact';

/**
 * The body sections of the settlement page (src/app/lawsuits/[slug]/page.tsx):
 * deadline and proof facts, "About this settlement", "Who may qualify" and
 * "How filing works".
 */

export interface DeadlineProofFactsProps {
  lawsuit: CatalogLawsuit;
  open: boolean;
  deadlinePassed: boolean;
  /** The verified badge shows (useIsVerified): the proof note follows the verified value. */
  verified: boolean;
  testID?: string;
}

/** The deadline (when listed) with its note, and the proof rule with its detail. */
export function DeadlineProofFacts({ lawsuit, open, deadlinePassed, verified, testID }: DeadlineProofFactsProps) {
  const deadlineNote = open
    ? settlement.deadlineCutoff.text
    : deadlinePassed
      ? settlement.deadlinePassed.text
      : settlement.notTakingClaims.text;
  const proofNote = verified
    ? proofDetail({ proof_required: false, eligibility: { proof: lawsuit.proof_verified ?? undefined } })
    : settlementProofDetail(lawsuit);

  return (
    <Card style={styles.card} testID={testID}>
      {lawsuit.deadline ? (
        <>
          <Fact
            label={settlement.deadline.text}
            value={formatDeadline(lawsuit.deadline)}
            note={deadlineNote}
            emphasis="strong"
          />
          <Divider />
        </>
      ) : null}
      <Fact label={settlement.proof.text} value={displayProofLabel(lawsuit)} note={proofNote} emphasis="strong" />
    </Card>
  );
}

/** "About this settlement": the listing's description. */
export function AboutSettlement({ description, testID }: { description: string; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <AppText variant="title">{settlement.aboutTitle.text}</AppText>
      <AppText variant="body" color="textMuted">
        {description}
      </AppText>
    </View>
  );
}

export interface WhoMayQualifyProps {
  /** displayEligibilityText: the verified text, the listing's summary, or null. */
  eligibility: string | null;
  official: CatalogLink | null;
  testID?: string;
}

/** "Who may qualify": a neutral box, since the text is unverified (as on the claim page's Step 1). */
export function WhoMayQualify({ eligibility, official, testID }: WhoMayQualifyProps) {
  return (
    <Card style={styles.card} testID={testID}>
      <AppText variant="heading">{settlement.whoMayQualify.text}</AppText>
      {eligibility ? (
        <View style={styles.tight}>
          <AppText variant="caption" color="textMuted">
            {settlement.whatOurListingSays.text}
          </AppText>
          <AppText variant="body">{eligibility}</AppText>
          <AppText variant="caption" color="textMuted" style={styles.note}>
            {settlement.shortSummaryNote.text}
          </AppText>
        </View>
      ) : (
        <AppText variant="body" color="textMuted">
          {settlement.noEligibilityRules.text}
        </AppText>
      )}
      {official?.kind === 'official' ? (
        <ExternalTextLink url={official.href} label={settlement.readRulesOnOfficialSite.text} />
      ) : null}
    </Card>
  );
}

const STEPS = [
  { title: settlement.stepQualifyTitle.text, body: settlement.stepQualifyBody.text },
  { title: settlement.stepFileTitle.text, body: settlement.stepFileBody.text },
  { title: settlement.stepTrackTitle.text, body: settlement.stepTrackBody.text },
] as const;

/** "How filing works", shown while the settlement is open: three numbered steps, each read as one phrase. */
export function HowFilingWorks({ testID }: { testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <AppText variant="title">{settlement.howFilingWorks.text}</AppText>
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} accessible style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText variant="labelSmall" color="textLink" style={styles.stepNumberText}>
                {String(index + 1)}
              </AppText>
            </View>
            <View style={styles.stepText}>
              <AppText variant="bodyStrong">{step.title}</AppText>
              <AppText variant="caption" color="textMuted">
                {step.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  section: {
    gap: space[3],
  },
  tight: {
    gap: space[1],
  },
  note: {
    marginTop: space[1],
  },
  steps: {
    gap: space[4],
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  stepNumber: {
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: space[1],
    borderRadius: radii.full,
    backgroundColor: colors.surfaceBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontFamily: fontFamilies.sansBold,
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
});
