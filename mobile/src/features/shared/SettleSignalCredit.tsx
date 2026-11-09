import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { shared } from '@/copy/shared';
import { space } from '@/theme/tokens';

import { ExternalTextLink } from './ExternalTextLink';

export const SETTLESIGNAL_URL = 'https://settlesignal.com/';
export const SETTLESIGNAL_DATA_URL = 'https://settlesignal.com/data/';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';

export interface SettleSignalCreditProps {
  /**
   * 'catalog': under a list that shows a SettleSignal record
   * (src/app/lawsuits/page.tsx; show it when the list has an
   * isSettleSignalRecord row). 'footer': the site-wide credit
   * (src/components/Footer.tsx), for the Legal screen.
   */
  variant?: 'catalog' | 'footer';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * SettleSignal's CC BY 4.0 credit. The sentence reads in full, and its two
 * links (SettleSignal and the license) follow as 44 pt text links.
 */
export function SettleSignalCredit({ variant = 'catalog', style, testID }: SettleSignalCreditProps) {
  const footer = variant === 'footer';
  const sentence = footer
    ? `${shared.creditFooterLead.text} ${shared.creditFooterSite.text}${shared.creditFooterUsedUnder.text} ${shared.creditFooterLicense.text}${shared.creditFooterTail.text}`
    : `${shared.creditListLead.text} ${shared.creditListSite.text} ${shared.creditListUnder.text} ${shared.creditListLicense.text}${shared.creditListTail.text}`;
  return (
    <View style={[styles.credit, style]} testID={testID}>
      <AppText variant="caption" color="textMuted">
        {sentence}
      </AppText>
      <View style={styles.links}>
        <ExternalTextLink
          url={footer ? SETTLESIGNAL_DATA_URL : SETTLESIGNAL_URL}
          label={footer ? shared.creditFooterSite.text : shared.creditListSite.text}
        />
        <ExternalTextLink
          url={CC_BY_4_URL}
          label={footer ? shared.creditFooterLicense.text : shared.creditListLicense.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  credit: {
    gap: space[1],
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[4],
  },
});
