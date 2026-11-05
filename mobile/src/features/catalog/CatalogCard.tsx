import { displaySummary } from '@shared/lib/lawsuit-display';
import { isOpenForClaims } from '@shared/lib/open-for-claims';
import { formatDeadline } from '@shared/lib/utils';
import { displayProofLabel } from '@shared/lib/verified-fields';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { catalog } from '@/copy/catalog';
import { fillCopy, shared } from '@/copy/shared';
import type { CatalogLawsuit } from '@/data/catalog';
import { SettlementBadges, UnverifiedLine, useIsVerified } from '@/features/shared';
import { colors, fontFamilies, radii, space, touchTarget, typography } from '@/theme/tokens';

/** A one-line title is shorter than a touch target; the slop makes it 44 pt tall. */
const TITLE_SLOP = Math.max(0, (touchTarget - (typography.heading.lineHeight ?? touchTarget)) / 2);
const TITLE_HIT_SLOP = { top: TITLE_SLOP, bottom: TITLE_SLOP };

export interface CatalogCardProps {
  lawsuit: CatalogLawsuit;
  /** From useNow(): decides open or closed and the deadline badges. */
  now: Date;
  onStartClaim(slug: string): void;
  onShowDetails(slug: string): void;
}

/**
 * One settlement (src/components/LawsuitCard.tsx): badges, the title (which
 * opens the details), the summary, Deadline / Proof / "Payout, as listed",
 * the unverified line with the official link, and "Start your claim" with
 * "Details" while the settlement is open for claims, or "Claims closed".
 * Memoized: a row renders again only when its settlement, the day or the
 * server flags change.
 */
export const CatalogCard = memo(function CatalogCard({ lawsuit, now, onStartClaim, onShowDetails }: CatalogCardProps) {
  // Read through the config, so the card renders again when the server flags arrive.
  const verified = useIsVerified(lawsuit);
  const open = isOpenForClaims(lawsuit, now);
  const summary = displaySummary(lawsuit);
  const deadline = lawsuit.deadline ? formatDeadline(lawsuit.deadline) : catalog.noDeadlineListed.text;
  const proof = displayProofLabel(lawsuit);
  const payout = lawsuit.typical_payout?.trim() || catalog.notStated.text;
  const showDetails = () => onShowDetails(lawsuit.slug);

  return (
    <Card style={styles.card} testID={`catalog-card-${lawsuit.slug}`}>
      <SettlementBadges lawsuit={lawsuit} now={now} />

      {/* A heading for screen-reader navigation that also opens the details, like the web's title link. */}
      <Pressable
        accessibilityRole="header"
        accessibilityLabel={lawsuit.title}
        onPress={showDetails}
        hitSlop={TITLE_HIT_SLOP}
      >
        {({ pressed }) => (
          <AppText variant="heading" color={pressed ? 'textLink' : 'text'} accessible={false}>
            {lawsuit.title}
          </AppText>
        )}
      </Pressable>

      {summary ? (
        <AppText variant="caption" color="textMuted" numberOfLines={3}>
          {summary}
        </AppText>
      ) : null}

      {lawsuit.deadline ? null : (
        <View style={styles.noDeadline}>
          <AppText variant="badge" color="textMuted">
            {catalog.noDeadlineListed.text}
          </AppText>
        </View>
      )}

      <View style={styles.stats}>
        <Stat label={catalog.deadline.text} value={deadline} />
        <Stat label={catalog.proof.text} value={proof} />
        <Stat label={catalog.payoutAsListed.text} value={payout} wide />
      </View>

      {verified ? null : <UnverifiedLine lawsuit={lawsuit} />}

      {open ? (
        <View style={styles.actions}>
          <Button
            label={catalog.startYourClaim.text}
            accessibilityLabel={fillCopy(shared.linkForTitle.text, { label: catalog.startYourClaim.text, title: lawsuit.title })}
            icon={ArrowRight}
            iconPosition="trailing"
            onPress={() => onStartClaim(lawsuit.slug)}
            style={styles.start}
          />
          <Button
            label={catalog.details.text}
            accessibilityLabel={fillCopy(catalog.detailsAbout.text, { title: lawsuit.title })}
            variant="secondary"
            onPress={showDetails}
            style={styles.details}
          />
        </View>
      ) : (
        <View style={styles.closed}>
          <AppText variant="labelSmall" color="textMuted" align="center" style={styles.closedText}>
            {shared.claimsClosed.text}
          </AppText>
        </View>
      )}
    </Card>
  );
});

/** A labeled fact (the web's dt/dd pair), read as one phrase. "Payout, as listed" spans the row. */
function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={wide ? styles.statWide : styles.stat}>
      <AppText variant="badge" color="textMuted" style={styles.statLabel}>
        {label}
      </AppText>
      <AppText variant="caption" color="text" numberOfLines={wide ? 2 : undefined} style={styles.statValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
  },
  noDeadline: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[3] - 2,
    paddingVertical: space[1],
    borderRadius: radii.full,
    backgroundColor: colors.background,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[3],
    rowGap: space[2],
    padding: space[3],
    borderRadius: radii.xl,
    backgroundColor: colors.background,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '40%',
    gap: 2,
  },
  statWide: {
    flexBasis: '100%',
    gap: 2,
  },
  statLabel: {
    fontFamily: fontFamilies.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: fontFamilies.sansSemibold,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    paddingTop: space[1],
  },
  start: {
    flexGrow: 2,
    flexBasis: 160,
    paddingHorizontal: space[3],
  },
  details: {
    flexGrow: 1,
    flexBasis: 80,
    paddingHorizontal: space[3],
  },
  closed: {
    marginTop: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[3] - 2,
    borderRadius: radii.xl,
    backgroundColor: colors.background,
  },
  closedText: {
    fontFamily: fontFamilies.sansSemibold,
  },
});
