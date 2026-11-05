import { StyleSheet, View } from 'react-native';

import { ErrorState, Screen, Skeleton } from '@/components/ui';
import { common } from '@/copy/common';
import { userFacingError } from '@/data/errors';
import { useProfile } from '@/data/profile';
import { SignedOutPrompt } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';
import { radii, space } from '@/theme/tokens';

import { DetailsForm } from './DetailsForm';

/**
 * /settings/details: loads the profile (direct Supabase read under RLS, as
 * the web settings page does), then shows the form. Signed out, it offers to
 * log in and come back here.
 */
export function DetailsScreen() {
  const { status, user, sessionEnded } = useAuth();
  const profile = useProfile();

  if (status !== 'signedIn' || !user) {
    return (
      <Screen centered>
        <SignedOutPrompt next="/settings/details" loggedOut={sessionEnded} />
      </Screen>
    );
  }

  // Only a first load that failed replaces the form. A failed reload (on
  // return to the app, or after a save) keeps it, with whatever was typed.
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

  if (profile.data === undefined) {
    return (
      <Screen>
        <View accessible accessibilityLabel={common.loading.text} style={styles.skeleton} testID="settings-details-loading">
          <Skeleton height={48} />
          <Skeleton height={300} radius={radii['2xl']} />
          <Skeleton width="70%" height={24} />
          <Skeleton height={260} radius={radii['2xl']} />
        </View>
      </Screen>
    );
  }

  // Keyed by user: another account signing in starts a fresh form.
  return <DetailsForm key={user.id} profile={profile.data} />;
}

const styles = StyleSheet.create({
  skeleton: {
    gap: space[4],
  },
});
