import { displaySummary, officialLinkFor } from '@shared/lib/lawsuit-display';
import { isOpenForClaims } from '@shared/lib/open-for-claims';
import { hasOfficialNoticeGuide, noticeCheckedOnLabel } from '@shared/lib/settlement-guides';
import { settlementAnswerFacts } from '@shared/lib/settlement-seo';
import { isDeadlinePassed } from '@shared/lib/utils';
import { displayEligibilityText, overlayVerifiedFacts } from '@shared/lib/verified-fields';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { settlement } from '@/copy/settlement';
import { toLawsuit, type SettlementRow } from '@/data/catalog';
import { LegalDisclaimer, SettlementBadges, UnverifiedNotice, useIsVerified } from '@/features/shared';
import { space } from '@/theme/tokens';

import { AnswerBlock } from './AnswerBlock';
import { SettlementFaq } from './SettlementFaq';
import { SettlementNextSteps } from './SettlementNextSteps';
import { SettlementProvenance } from './SettlementProvenance';
import { AboutSettlement, DeadlineProofFacts, HowFilingWorks, WhoMayQualify } from './SettlementSections';

export interface SettlementDetailProps {
  /** The proof note and the FAQ come with it, from the guides its deadline, payout and link came from. */
  lawsuit: SettlementRow;
  /** From useNow(): open or closed, and the deadline wording. */
  now: Date;
  signedIn: boolean;
  onStartClaim(): void;
  onBrowse(): void;
}

/**
 * The settlement page's sections in the web's order
 * (src/app/lawsuits/[slug]/page.tsx): badges, title and summary, "The short
 * answer", the next step while open, the unverified section unless verified,
 * deadline and proof, About, Who may qualify, How filing works, the FAQ,
 * where the listing comes from, the sidebar shown inline, and the full
 * LEGAL_DISCLAIMER (plan 3.3 and section 5). Breadcrumbs, hub links,
 * add-to-calendar and proof feedback are not in v1.
 */
export function SettlementDetail({ lawsuit, now, signedIn, onStartClaim, onBrowse }: SettlementDetailProps) {
  // Read through the config, so the page renders again when the server flags arrive.
  const verified = useIsVerified(lawsuit);
  const guided = hasOfficialNoticeGuide(lawsuit.slug);
  const checkedLabel = noticeCheckedOnLabel(lawsuit.slug);
  const open = isOpenForClaims(lawsuit, now);
  const deadlinePassed = isDeadlinePassed(lawsuit.deadline, now);
  const official = officialLinkFor(lawsuit);
  const summary = displaySummary(lawsuit);
  const payout = lawsuit.typical_payout?.trim() || settlement.notStated.text;
  const description = lawsuit.description?.trim();
  // Skip a description that only repeats the payout or the summary (and one that is blank).
  const about = description && description !== payout && description !== summary ? lawsuit.description : null;
  const facts = overlayVerifiedFacts(settlementAnswerFacts(toLawsuit(lawsuit)), lawsuit);

  return (
    <>
      <View style={styles.header} testID="settlement-section-header">
        <SettlementBadges lawsuit={lawsuit} variant="detail" now={now} />
        <AppText variant="display">{lawsuit.title}</AppText>
        {summary ? (
          <AppText variant="body" color="textMuted">
            {summary}
          </AppText>
        ) : null}
      </View>

      <AnswerBlock
        facts={facts}
        open={open}
        official={official}
        onCheckIfYouQualify={onStartClaim}
        testID="settlement-section-answer"
      />

      {open ? (
        <View style={styles.start} testID="settlement-section-start">
          <Button
            label={settlement.startYourClaim.text}
            icon={ArrowRight}
            iconPosition="trailing"
            onPress={onStartClaim}
            fullWidth
          />
          <AppText variant="caption" color="textMuted">
            {settlement.freeYouFileYourself.text}
          </AppText>
        </View>
      ) : null}

      {verified || guided ? (
        checkedLabel ? (
          <AppText variant="caption" color="textMuted" testID="settlement-section-checked">
            {checkedLabel}
          </AppText>
        ) : null
      ) : (
        <UnverifiedNotice variant="settlement" lawsuit={lawsuit} open={open} testID="settlement-section-unverified" />
      )}

      <DeadlineProofFacts
        lawsuit={lawsuit}
        open={open}
        deadlinePassed={deadlinePassed}
        verified={verified}
        testID="settlement-section-facts"
      />

      {about ? <AboutSettlement description={about} testID="settlement-section-about" /> : null}

      <WhoMayQualify
        eligibility={displayEligibilityText(lawsuit)}
        official={official}
        testID="settlement-section-qualify"
      />

      {open ? <HowFilingWorks testID="settlement-section-how" /> : null}

      <SettlementFaq items={lawsuit.faqs} testID="settlement-section-faq" />

      <SettlementProvenance lawsuit={lawsuit} official={official} testID="settlement-section-provenance" />

      <SettlementNextSteps
        open={open}
        deadline={lawsuit.deadline}
        deadlinePassed={deadlinePassed}
        official={official}
        signedIn={signedIn}
        onStartClaim={onStartClaim}
        onBrowse={onBrowse}
        testID="settlement-section-next-steps"
      />

      <LegalDisclaimer testID="settlement-section-legal" />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[4],
  },
  start: {
    gap: space[2],
  },
});
