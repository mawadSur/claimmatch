import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ErrorState, Screen, Skeleton } from '@/components/ui';
import { common } from '@/copy/common';
import { userFacingError } from '@/data/errors';
import { useProfile } from '@/data/profile';
import { firstParam, safeNextPath, SignedOutPrompt } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';
import { radii, space } from '@/theme/tokens';

import { OnboardingWizard } from './OnboardingWizard';

/**
 * /onboarding, a full-screen modal (src/app/onboarding/page.tsx). Opened by
 * the root layout's gate after sign-in while the profile is not onboarded,
 * from the dashboard's "Finish your profile", and after an email link
 * (`confirmed=1`). Starts from the saved name, state and answers.
 */
export function OnboardingScreen() {
  const { status, user, sessionEnded } = useAuth();
  const params = useLocalSearchParams<{ next?: string | string[]; confirmed?: string | string[] }>();
  const next = safeNextPath(params.next);
  const emailConfirmed = firstParam(params.confirmed) === '1';
  const profile = useProfile();

  if (status !== 'signedIn' || !user) {
    return (
      <Screen centered>
        <SignedOutPrompt loggedOut={sessionEnded} />
      </Screen>
    );
  }

  // Only a first load that failed replaces the wizard. A failed reload (on
  // return to the app) keeps it, with whatever was typed.
  if (profile.isError && profile.data === undefined) {
    const failure = userFacingError(profile.error);
    return (
      <Screen centered>
        <ErrorState
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
          body={failure?.code === 'network' ? failure.message : undefined}
        />
      </Screen>
    );
  }

  if (profile.data === undefined) return <OnboardingSkeleton />;

  return (
    <OnboardingWizard
      key={user.id}
      initial={{
        fullName: profile.data?.full_name ?? '',
        state: profile.data?.state ?? '',
        attributes: profile.data?.attributes ?? {},
      }}
      email={user.email ?? null}
      next={next}
      emailConfirmed={emailConfirmed}
    />
  );
}

function OnboardingSkeleton() {
  return (
    <Screen>
      <View accessible accessibilityLabel={common.loading.text} style={styles.skeleton} testID="onboarding-loading">
        <Skeleton width={120} height={24} radius={radii.full} />
        <Skeleton width="80%" height={36} />
        <Skeleton height={72} />
        <Skeleton height={160} radius={radii['2xl']} />
        <Skeleton height={220} radius={radii['2xl']} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    gap: space[4],
  },
});
