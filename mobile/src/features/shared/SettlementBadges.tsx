import { closesInChip } from '@shared/lib/closing-soon';
import { isOpenForClaims } from '@shared/lib/open-for-claims';
import type { Lawsuit } from '@shared/lib/types';
import { deadlineUrgencyLabel } from '@shared/lib/utils';
import { isVerifiedRecord, verifiedOnLabel, type VerifiedFieldSource } from '@shared/lib/verified-fields';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge } from '@/components/ui';
import { BadgeCheck, Clock } from '@/components/ui/icons';
import { shared } from '@/copy/shared';
import { useConfig } from '@/providers/ConfigProvider';
import { space } from '@/theme/tokens';

import { useNow } from './use-now';

/** The settlement fields the badges read (a catalog row fits). */
export type BadgeSettlement = VerifiedFieldSource & Pick<Lawsuit, 'slug' | 'category' | 'status' | 'review_status' | 'deadline'>;

/**
 * Whether the public "Verified on {date}" badge shows for this row:
 * VERIFIED_FIELDS_ENABLED is on and an admin verified at least one field
 * (showVerifiedBadge on the web). When true, the unverified label and notice
 * are hidden. Read through useConfig, so screens update when flags arrive.
 */
export function useIsVerified(lawsuit: VerifiedFieldSource): boolean {
  const { isFlagOn } = useConfig();
  return isFlagOn('VERIFIED_FIELDS_ENABLED') && isVerifiedRecord(lawsuit);
}

/** No match scores or "Matched" labels on cards (LawsuitCard isAllowedBadge, D50). */
function isAllowedBadge(label: string): boolean {
  return !label.includes('%') && !/\bmatched\b/i.test(label);
}

export interface SettlementBadgesProps {
  lawsuit: BadgeSettlement;
  /**
   * 'card' (LawsuitCard): category, then verified, closes-in and urgency.
   * 'detail' (settlement page header): category, open or closed, urgency,
   * closes-in, verified.
   */
  variant?: 'card' | 'detail';
  /** Replaces the category on a card, such as a claim status. Labels with "%" or "Matched" are dropped. */
  badge?: { label: string; tone?: 'brand' | 'green' | 'red' | 'gray' };
  /** Defaults to useNow(). */
  now?: Date;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The badge row of a settlement, as on the web: the "Closes in N days" chip
 * with CLOSES_IN_CHIPS_ENABLED, otherwise the red urgency badge in the last
 * 30 days of an open settlement; "Verified on {date}" with
 * VERIFIED_FIELDS_ENABLED. Badges wrap at large text sizes.
 */
export function SettlementBadges({ lawsuit, variant = 'card', badge, now, style, testID }: SettlementBadgesProps) {
  const { isFlagOn } = useConfig();
  const today = useNow();
  const isVerified = useIsVerified(lawsuit);
  const at = now ?? today;
  const open = isOpenForClaims(lawsuit, at);
  const closesInOn = isFlagOn('CLOSES_IN_CHIPS_ENABLED');
  const closesIn = closesInOn ? closesInChip(lawsuit.deadline, at) : null;
  const urgency = !closesInOn && open ? deadlineUrgencyLabel(lawsuit.deadline, at) : null;
  const verifiedLabel = isVerified ? verifiedOnLabel(lawsuit.verified_at) : null;
  const shown = badge && isAllowedBadge(badge.label) ? badge : null;

  const category = <Badge label={shown?.label ?? lawsuit.category} tone={shown?.tone ?? 'brand'} />;
  const verified = verifiedLabel ? <Badge label={verifiedLabel} tone="green" icon={BadgeCheck} /> : null;
  const closes = closesIn ? <Badge label={closesIn} tone="red" icon={Clock} /> : null;
  const urgent = urgency ? <Badge label={urgency} tone="red" icon={Clock} /> : null;

  if (variant === 'detail') {
    return (
      <View style={[styles.wrap, style]} testID={testID}>
        {category}
        <Badge label={open ? shared.openForClaims.text : shared.claimsClosed.text} tone={open ? 'green' : 'gray'} />
        {urgent}
        {closes}
        {verified}
      </View>
    );
  }

  return (
    <View style={[styles.card, style]} testID={testID}>
      {category}
      {verified || closes || urgent ? (
        <View style={styles.trailing}>
          {verified}
          {closes}
          {urgent}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[2],
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[2],
  },
  trailing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: space[1],
  },
});
