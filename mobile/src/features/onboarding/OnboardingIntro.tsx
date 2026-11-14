import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Notice } from '@/components/ui';
import { Clock } from '@/components/ui/icons';
import { onboarding } from '@/copy/onboarding';
import { colors, radii, space } from '@/theme/tokens';

const HOW_IT_WORKS = [
  onboarding.howStep1.text,
  onboarding.howStep2.text,
  onboarding.howStep3.text,
  onboarding.howStep4.text,
];

/**
 * The onboarding page header (src/app/onboarding/page.tsx:44-84): the
 * "About 1 minute" badge, the headline, the "never files for you" intro, how
 * Lawsuit AI works, and "Email confirmed." after an email link.
 */
export function OnboardingIntro({ emailConfirmed }: { emailConfirmed: boolean }) {
  return (
    <View style={styles.intro}>
      <Badge label={onboarding.aboutOneMinute.text} tone="brand" icon={Clock} />
      <AppText variant="display">{onboarding.title.text}</AppText>
      <AppText variant="body" color="textMuted">
        {`${onboarding.intro.text} ${onboarding.howItWorks.text}`}
      </AppText>
      <Card padding={5} style={styles.steps}>
        {HOW_IT_WORKS.map((step, index) => (
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
