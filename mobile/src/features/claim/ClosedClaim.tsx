import { formatDeadline } from '@shared/lib/utils';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, Screen } from '@/components/ui';
import { ArrowRight, CalendarX2 } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { claim as copy, closedIfWrongSentence, closedSentence } from '@/copy/claim';
import { notices } from '@/copy/notices';
import type { ClosedClaimScreen } from '@/data/claims';
import { ExternalTextLink } from '@/features/shared';
import { space } from '@/theme/tokens';

import { ClaimHeader } from './ClaimStates';

export interface ClosedClaimProps {
  data: ClosedClaimScreen;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * A settlement that no longer takes claims, for someone with no claim on it
 * (the closed card in src/app/claim/[slug]/page.tsx).
 */
export function ClosedClaim({ data, refreshing, onRefresh }: ClosedClaimProps) {
  const router = useRouter();
  const official = data.officialUrl;
  const first = closedSentence(data.deadline && data.deadlinePassed ? formatDeadline(data.deadline) : null);
  const second = official ? closedIfWrongSentence() : copy.closedNoOfficial.text;
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="claim-closed">
      <ClaimHeader category={data.category} title={data.title} />
      <Card style={styles.card}>
        <View style={styles.titleRow}>
          <Icon icon={CalendarX2} size="md" color="textMuted" />
          <AppText variant="heading" style={styles.title}>
            {copy.closedTitle.text}
          </AppText>
        </View>
        <View style={styles.tight}>
          <AppText variant="caption" color="textMuted">
            {`${first} ${second}`}
          </AppText>
          {official ? <ExternalTextLink url={official} label={notices.checkOfficialSite.text} /> : null}
        </View>
        <AppText variant="caption" color="textMuted">
          {copy.closedKeepConfirmation.text}
        </AppText>
        <Button
          label={app.browseOpenSettlements.text}
          icon={ArrowRight}
          iconPosition="trailing"
          onPress={() => router.dismissTo('/lawsuits')}
          fullWidth
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  title: {
    flex: 1,
  },
  tight: {
    gap: space[1],
  },
});
