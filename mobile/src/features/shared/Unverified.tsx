import { officialLinkFor, type CatalogLink } from '@shared/lib/lawsuit-display';
import type { Lawsuit } from '@shared/lib/types';
import type { VerifiedFieldSource } from '@shared/lib/verified-fields';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Badge, Icon, Notice } from '@/components/ui';
import { TriangleAlert } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { fillCopy, shared } from '@/copy/shared';
import { fontFamilies, space, typography } from '@/theme/tokens';

import { ExternalTextLink } from './ExternalTextLink';
import { useHostLabels } from './host-label';
import { useIsVerified } from './SettlementBadges';

/**
 * "Unverified: check the official site" (D50) in its three web forms: the
 * page notice (catalog and settlement page), the card line with the official
 * link, and the pill (claim flow Step 1, Closing soon). The line and the
 * settlement notice hide themselves when the row shows as verified.
 */

/** The settlement fields the line and the settlement notice read (a catalog row fits). */
export type UnverifiedSettlement = VerifiedFieldSource & Pick<Lawsuit, 'claim_url' | 'source_url'>;

export type UnverifiedNoticeProps = { style?: StyleProp<ViewStyle>; testID?: string } & (
  | {
      /** The catalog's notice (src/app/lawsuits/page.tsx). */
      variant: 'catalog';
    }
  | {
      /** The settlement page's section, with the official link (src/app/lawsuits/[slug]/page.tsx). */
      variant: 'settlement';
      lawsuit: UnverifiedSettlement;
      /** isOpenForClaims: picks the open or the closed wording. */
      open: boolean;
    }
);

/** The amber page notice. */
export function UnverifiedNotice(props: UnverifiedNoticeProps) {
  if (props.variant === 'settlement') {
    return <SettlementNotice lawsuit={props.lawsuit} open={props.open} style={props.style} testID={props.testID} />;
  }
  return (
    <Notice
      tone="unverified"
      title={common.unverifiedLabel.text}
      body={common.unverifiedNoticeBody.text}
      style={props.style}
      testID={props.testID}
    />
  );
}

function SettlementNotice({
  lawsuit,
  open,
  style,
  testID,
}: {
  lawsuit: UnverifiedSettlement;
  open: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const verified = useIsVerified(lawsuit);
  if (verified) return null;
  return (
    <Notice
      tone="unverified"
      title={common.unverifiedLabel.text}
      body={open ? shared.unverifiedOpenBody.text : shared.unverifiedClosedBody.text}
      style={style}
      testID={testID}
    >
      <OfficialLink link={officialLinkFor(lawsuit)} />
    </Notice>
  );
}

/** The settlement page's OfficialLink: the official site, else the source page clearly labeled, else what to do. */
function OfficialLink({ link }: { link: CatalogLink | null }) {
  const hostLabels = useHostLabels();
  if (!link) {
    return (
      <AppText variant="caption" color="warningStrong" style={styles.strong}>
        {shared.noOfficialLink.text}
      </AppText>
    );
  }
  if (link.kind === 'official') {
    return (
      <ExternalTextLink
        url={link.href}
        {...hostLabels(link.host, (host) => `${shared.goToOfficialSite.text} (${host})`)}
        tone="warning"
        framed
        style={styles.linkSpacing}
      />
    );
  }
  return (
    <View style={styles.source}>
      <AppText variant="caption" color="warningStrong">
        {shared.sourceLinkIntro.text}
      </AppText>
      <ExternalTextLink
        url={link.href}
        {...hostLabels(link.host, (host) => `${link.label} (${host}, ${shared.notTheOfficialSite.text})`)}
        tone="warning"
        framed
      />
    </View>
  );
}

export interface UnverifiedLineProps {
  lawsuit: UnverifiedSettlement & Pick<Lawsuit, 'title'>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The card line: "Unverified: check the official site." and the link
 * labeled for where it goes ("Official site", "SettleSignal listing",
 * "Source page"), or "We don’t have its link yet."
 */
export function UnverifiedLine({ lawsuit, style, testID }: UnverifiedLineProps) {
  const verified = useIsVerified(lawsuit);
  if (verified) return null;
  const link = officialLinkFor(lawsuit);
  return (
    <View style={[styles.line, style]} testID={testID}>
      <View style={styles.lineIcon}>
        <Icon icon={TriangleAlert} size="xs" color="warningIcon" />
      </View>
      <View style={styles.lineText}>
        <AppText variant="caption" color="warningStrong" style={styles.strong}>
          {shared.unverifiedLineLabel.text}
        </AppText>
        {link ? (
          <ExternalTextLink
            url={link.href}
            label={link.label}
            accessibilityLabel={fillCopy(shared.linkForTitle.text, { label: link.label, title: lawsuit.title })}
            tone="warning"
          />
        ) : (
          <AppText variant="caption" color="warningStrong">
            {shared.noLinkYet.text}
          </AppText>
        )}
      </View>
    </View>
  );
}

/** The amber pill (src/components/claims/UnverifiedLabel.tsx). */
export function UnverifiedBadge({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  return <Badge label={common.unverifiedLabel.text} tone="amber" icon={TriangleAlert} style={style} testID={testID} />;
}

const styles = StyleSheet.create({
  strong: {
    fontFamily: fontFamilies.sansSemibold,
  },
  linkSpacing: {
    marginTop: space[2],
  },
  source: {
    gap: space[2],
    marginTop: space[1],
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  lineIcon: {
    // Centers the icon on the first line of caption text.
    minHeight: typography.caption.lineHeight,
    justifyContent: 'center',
  },
  lineText: {
    flex: 1,
  },
});
