import { isSettleSignalRecord, settleSignalPageFor, type CatalogLink } from '@shared/lib/lawsuit-display';
import { StyleSheet, View } from 'react-native';

import { AppText, Divider } from '@/components/ui';
import { settlement } from '@/copy/settlement';
import type { CatalogLawsuit } from '@/data/catalog';
import { CC_BY_4_URL, ExternalTextLink, SETTLESIGNAL_URL } from '@/features/shared';
import { space } from '@/theme/tokens';

export interface SettlementProvenanceProps {
  lawsuit: CatalogLawsuit;
  official: CatalogLink | null;
  testID?: string;
}

/**
 * "Where this listing comes from" (src/app/lawsuits/[slug]/page.tsx), for a
 * SettleSignal record (with its CC BY 4.0 credit) or a listing whose only
 * link is a source page. The sentence reads in full; its links follow as
 * 44 pt text links, as in the catalog credit.
 */
export function SettlementProvenance({ lawsuit, official, testID }: SettlementProvenanceProps) {
  const fromSettleSignal = isSettleSignalRecord(lawsuit);
  if (!fromSettleSignal && official?.kind !== 'source') return null;
  const listingPage = settleSignalPageFor(lawsuit);

  return (
    <View style={styles.section} testID={testID}>
      <Divider />
      <AppText variant="heading">{settlement.provenanceTitle.text}</AppText>
      {fromSettleSignal ? (
        <>
          <AppText variant="caption" color="textMuted">
            {`${settlement.provenanceAdaptedFrom.text} ${settlement.provenanceSite.text}${settlement.provenanceUsedUnder.text} ${settlement.provenanceLicense.text}${settlement.provenanceTail.text}`}
          </AppText>
          <View style={styles.links}>
            <ExternalTextLink url={SETTLESIGNAL_URL} label={settlement.provenanceSite.text} />
            <ExternalTextLink url={CC_BY_4_URL} label={settlement.provenanceLicense.text} />
            {listingPage ? <ExternalTextLink url={listingPage} label={settlement.seeSettleSignalListing.text} /> : null}
          </View>
        </>
      ) : official ? (
        <AppText variant="caption" color="textMuted">
          {`${settlement.foundListingOn.text} ${official.host}. ${settlement.sourceNotOfficial.text}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[4],
  },
});
