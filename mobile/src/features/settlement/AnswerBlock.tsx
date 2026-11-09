import type { CatalogLink } from '@shared/lib/lawsuit-display';
import type { AnswerFacts } from '@shared/lib/settlement-seo';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ExternalLinkButton } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { fillCopy } from '@/copy/shared';
import { settlement } from '@/copy/settlement';
import { ExternalTextLink, hostLabels } from '@/features/shared';
import { colors, radii, space } from '@/theme/tokens';

import { Fact } from './Fact';

export interface AnswerBlockProps {
  /** overlayVerifiedFacts(settlementAnswerFacts(…)). */
  facts: AnswerFacts;
  open: boolean;
  official: CatalogLink | null;
  onCheckIfYouQualify(): void;
  testID?: string;
}

/**
 * "The short answer" (src/components/settlement/AnswerBlock.tsx): the
 * listing's facts, what is missing with the link to check, and while open
 * "Check if you qualify" and the official claim site.
 */
export function AnswerBlock({ facts, open, official, onCheckIfYouQualify, testID }: AnswerBlockProps) {
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.intro}>
        <AppText variant="heading">{settlement.shortAnswerTitle.text}</AppText>
        <AppText variant="caption" color="textMuted">
          {settlement.shortAnswerNote.text}
        </AppText>
      </View>

      <View style={styles.facts}>
        {facts.qualifies ? <Fact label={settlement.factWhoQualifies.text} value={facts.qualifies} /> : null}
        {facts.payout ? <Fact label={settlement.factListedPayout.text} value={facts.payout} /> : null}
        {facts.deadline ? <Fact label={settlement.factClaimDeadline.text} value={facts.deadline} /> : null}
        {facts.proof ? <Fact label={settlement.factProofNeeded.text} value={facts.proof} /> : null}
        {facts.administrator ? <Fact label={settlement.factAdministrator.text} value={facts.administrator} /> : null}
      </View>

      {facts.missing.length > 0 ? <MissingDetails missing={facts.missing} official={official} /> : null}

      {open ? (
        <View style={styles.actions}>
          <Button
            label={settlement.checkIfYouQualify.text}
            icon={ArrowRight}
            iconPosition="trailing"
            onPress={onCheckIfYouQualify}
            fullWidth
          />
          {official?.kind === 'official' ? (
            <ExternalLinkButton
              url={official.href}
              {...hostLabels(official.host, (host) => `${settlement.officialClaimSite.text} (${host})`)}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * "We don’t have these details yet: …" (MissingDetailsBlock). The web puts
 * the link in parentheses at the end of the sentence; here the sentence ends
 * and the link follows as its own 44 pt control.
 */
function MissingDetails({ missing, official }: { missing: string[]; official: CatalogLink | null }) {
  return (
    <View style={styles.missing} testID="settlement-missing-details">
      <AppText variant="caption" color="text">
        {`${fillCopy(settlement.missingDetails.text, { list: missing.join(', ') })}.`}
      </AppText>
      {official ? (
        <ExternalTextLink
          url={official.href}
          {...(official.kind === 'official' ? hostLabels(official.host) : { label: official.label })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[4],
  },
  intro: {
    gap: space[1],
  },
  facts: {
    gap: space[4],
  },
  missing: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.background,
  },
  actions: {
    gap: space[3],
    paddingTop: space[1],
  },
});
