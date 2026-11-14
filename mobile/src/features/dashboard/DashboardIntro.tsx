import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, Notice } from '@/components/ui';
import { ArrowRight, CircleCheck, UserCog } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { dashboard, introSentence } from '@/copy/dashboard';
import { fillCopy } from '@/copy/shared';
import { showsFeeDisclosure } from '@/lib/flags';
import { useConfig } from '@/providers/ConfigProvider';
import { colors, radii, space } from '@/theme/tokens';

import { IconTile } from './parts';

/**
 * The top of the dashboard (src/app/dashboard/page.tsx): greeting and the
 * header sentence, the banners, the WelcomeCard after onboarding and
 * "Finish your profile". The screen title ("Your claims") is the native
 * header's.
 */

/**
 * "Hi, {firstName}." and the header sentence, worded for FEE_DISCLOSURE_ENABLED
 * (plan 5), with the disclosed wording until the server's flags are known.
 */
export function DashboardHeader({ firstName }: { firstName: string }) {
  const config = useConfig();
  return (
    <View style={styles.header} testID="dashboard-header">
      {firstName ? <AppText variant="title">{fillCopy(dashboard.greeting.text, { firstName })}</AppText> : null}
      <AppText variant="body" color="textMuted">
        {introSentence(showsFeeDisclosure(config))}
      </AppText>
    </View>
  );
}

/** ?denied=admin and ?password=updated, as on the web. */
export function DashboardBanners({ deniedAdmin, passwordUpdated }: { deniedAdmin: boolean; passwordUpdated: boolean }) {
  return (
    <View style={styles.stack}>
      {deniedAdmin ? <Notice tone="unverified" body={dashboard.deniedAdmin.text} announce testID="dashboard-denied-admin" /> : null}
      {passwordUpdated ? (
        <Notice tone="success" body={dashboard.passwordUpdated.text} testID="dashboard-password-updated" />
      ) : null}
    </View>
  );
}

const WELCOME_STEPS = [
  dashboard.welcomeStep1.text,
  dashboard.welcomeStep2.text,
  dashboard.welcomeStep3.text,
  dashboard.welcomeStep4.text,
];

/** "You’re all set" and how Lawsuit AI works, after onboarding (?welcome=1). */
export function WelcomeCard({ onBrowse }: { onBrowse: () => void }) {
  return (
    <Card style={[styles.card, styles.welcome]} testID="dashboard-welcome">
      <View style={styles.titleRow}>
        <Icon icon={CircleCheck} size="md" color="successIcon" />
        <AppText variant="heading" style={styles.shrink}>
          {dashboard.welcomeTitle.text}
        </AppText>
      </View>
      <AppText variant="caption" color="textMuted">
        {dashboard.welcomeIntro.text}
      </AppText>
      <View style={styles.steps}>
        {WELCOME_STEPS.map((step, index) => (
          <View key={step} style={styles.step} accessible accessibilityLabel={`${index + 1}. ${step}`}>
            <AppText variant="caption" color="text" style={styles.stepNumber}>
              {`${index + 1}.`}
            </AppText>
            <AppText variant="caption" color="text" style={styles.shrink}>
              {step}
            </AppText>
          </View>
        ))}
      </View>
      <Button label={app.browseOpenSettlements.text} icon={ArrowRight} iconPosition="trailing" onPress={onBrowse} />
    </Card>
  );
}

/** Shown until onboarding is done (profile.onboarded, as the web checks). */
export function FinishProfileCard({ onFinish }: { onFinish: () => void }) {
  return (
    <View style={styles.finish} testID="dashboard-finish-profile">
      <View style={styles.finishRow}>
        <IconTile icon={UserCog} />
        <View style={styles.finishText}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {dashboard.finishProfileTitle.text}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {dashboard.finishProfileBody.text}
          </AppText>
        </View>
      </View>
      <Button label={dashboard.finishProfileAction.text} icon={ArrowRight} iconPosition="trailing" onPress={onFinish} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[2],
  },
  stack: {
    gap: space[3],
  },
  card: {
    gap: space[3],
  },
  welcome: {
    borderColor: colors.successBorder,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  shrink: {
    flexShrink: 1,
  },
  steps: {
    gap: space[2],
  },
  step: {
    flexDirection: 'row',
    gap: space[2],
  },
  stepNumber: {
    minWidth: space[5],
  },
  finish: {
    gap: space[4],
    padding: space[5],
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.background,
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  finishText: {
    flex: 1,
    gap: space[1],
  },
});
