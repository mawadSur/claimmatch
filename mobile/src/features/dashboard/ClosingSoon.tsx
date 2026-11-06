import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ExternalLinkButton, TextLink } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { dashboard } from '@/copy/dashboard';
import { fillCopy, shared } from '@/copy/shared';
import { claimHref, isClaimHref, UnverifiedBadge } from '@/features/shared';
import { toSafeWebUrl } from '@/lib/external-link';
import { space } from '@/theme/tokens';

import { DashedCard, SectionError, SectionTitle } from './parts';
import type { ClosingSoonItem, DashboardResponse } from './types';
import type { DashboardNavigation } from './use-dashboard-navigation';
import { DeadlineLine } from './YourMatches';

/**
 * "Closing soon" (src/components/claims/ClosingSoon.tsx): open settlements in
 * the list with the nearest deadlines. A catalog module, not matches, so
 * every row carries "Unverified: check the official site" (plan 5).
 */
export function ClosingSoon({ closingSoon, nav }: { closingSoon: DashboardResponse['closingSoon']; nav: DashboardNavigation }) {
  let content: ReactNode;
  if (closingSoon.failed) {
    content = (
      <SectionError
        title={dashboard.closingSoonFailedTitle.text}
        body={dashboard.closingSoonFailedBody.text}
        testID="dashboard-closing-soon-failed"
      >
        <TextLink label={dashboard.goToAllSettlements.text} onPress={nav.openSettlements} />
      </SectionError>
    );
  } else if (closingSoon.items.length === 0) {
    content = (
      <DashedCard testID="dashboard-closing-soon-empty">
        <View>
          <AppText variant="caption" color="textMuted">
            {dashboard.noDeadlinesSoon.text}
          </AppText>
          <TextLink label={dashboard.browseAllOpenSettlements.text} onPress={nav.openSettlements} />
        </View>
      </DashedCard>
    );
  } else {
    content = closingSoon.items.map((item) => <ClosingSoonCard key={item.id} item={item} onOpen={nav.openClaim} />);
  }

  return (
    <View style={styles.section} testID="dashboard-closing-soon">
      <SectionTitle
        title={dashboard.closingSoonTitle.text}
        description={dashboard.closingSoonIntro.text}
        action={<Button label={dashboard.browseAllSettlements.text} variant="secondary" onPress={nav.openSettlements} />}
        // An outlined button too wide to sit beside the title: under the description, as on the web's narrow layout.
        actionPlacement="below"
        testID="dashboard-closing-soon-title"
      />
      {content}
    </View>
  );
}

function ClosingSoonCard({ item, onOpen }: { item: ClosingSoonItem; onOpen: (href: unknown) => void }) {
  const href = claimHref(item.slug);
  const officialUrl = toSafeWebUrl(item.officialUrl);
  return (
    <Card padding={4} style={styles.card} testID={`closing-soon-${item.id}`}>
      <AppText variant="bodyStrong">{item.title}</AppText>
      <DeadlineLine text={item.deadlineText} />
      <UnverifiedBadge />
      <View style={styles.actions}>
        {officialUrl ? (
          <ExternalLinkButton
            url={officialUrl}
            label={dashboard.officialSite.text}
            variant="ghost"
            accessibilityLabel={fillCopy(shared.linkForTitle.text, { label: dashboard.officialSite.text, title: item.title })}
          />
        ) : null}
        {isClaimHref(href) ? (
          <Button
            label={dashboard.howToFile.text}
            variant="secondary"
            icon={ArrowRight}
            iconPosition="trailing"
            accessibilityLabel={fillCopy(dashboard.actionFor.text, { label: dashboard.howToFile.text, title: item.title })}
            onPress={() => onOpen(href)}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[4],
  },
  card: {
    gap: space[2],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    paddingTop: space[1],
  },
});
