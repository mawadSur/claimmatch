import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Notice } from '@/components/ui';
import { Clock } from '@/components/ui/icons';
import { onboarding, onboardingHowStep3Text, onboardingIntroText } from '@/copy/onboarding';
import { useConfig } from '@/providers/ConfigProvider';
import { colors, radii, space } from '@/theme/tokens';

/**
 * The onboarding page header (src/app/onboarding/page.tsx:44-84): the
 * "About 1 minute" badge, the headline, the intro (never-files off, may-file
 * on), how Lawsuit AI works, and "Email confirmed." after an email link.
 */
export function OnboardingIntro({ emailConfirmed }: { emailConfirmed: boolean }) {
  const mayFile = useConfig().isFlagOn('ONE_CLICK_FILING_ENABLED');
  const intro = onboardingIntroText(mayFile);
  const howItWorks = [
    onboarding.howStep1.text,
    onboarding.howStep2.text,
    onboardingHowStep3Text(mayFile),
    onboarding.howStep4.text,
  ];
  return (
    <View style={styles.intro}>
      <Badge label={onboarding.aboutOneMinute.text} tone="brand" icon={Clock} />
      <AppText variant="display">{onboarding.title.text}</AppText>
      <AppText variant="body" color="textMuted">
        {`${intro} ${onboarding.howItWorks.text}`}
      </AppText>
      <Card padding={5} style={styles.steps}>
        {howItWorks.map((step, index) => (
          <View key={step} accessible accessibilityLabel={`${index + 1}. ${step}`} style={styles.step}>
            <View style={styles.number}>
              <AppText variant="badge" color="textLink">
                {String(index + 1)}
              </AppText>
            </View>
            <AppText variant="caption" color="text" style={styles.stepText}>
              {step}
            </AppText>
          </View>
        ))}
      </Card>
      {emailConfirmed ? (
        <Notice tone="success" title={onboarding.emailConfirmed.text} body={onboarding.emailConfirmedBody.text} />
      ) : null}
    </View>
  );
}

const NUMBER = 24;

const styles = StyleSheet.create({
  intro: {
    gap: space[4],
  },
  steps: {
    gap: space[3],
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  number: {
    width: NUMBER,
    height: NUMBER,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    paddingTop: 2,
  },
});
