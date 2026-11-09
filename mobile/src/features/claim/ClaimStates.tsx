import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, EmptyState, ErrorState, Screen, Skeleton } from '@/components/ui';
import { Compass, Search } from '@/components/ui/icons';
import { app } from '@/copy/app';
import { claim as copy, loadErrorTitle } from '@/copy/claim';
import { common } from '@/copy/common';
import { userFacingError } from '@/data/errors';
import { SignedOutPrompt, claimHref } from '@/features/shared';
import { radii, space } from '@/theme/tokens';

/** The settlement's category and title above the claim (src/app/claim/[slug]/page.tsx header). */
export function ClaimHeader({ category, title }: { category: string | null; title: string }) {
  return (
    <View style={styles.header}>
      {category ? <Badge label={category} tone="brand" /> : null}
      <AppText variant="title">{title}</AppText>
    </View>
  );
}

/** While the claim screen loads (src/app/claim/[slug]/loading.tsx). */
export function ClaimLoading() {
  return (
    <Screen testID="claim-loading">
      <View accessible accessibilityLabel={copy.loadingSteps.text} style={styles.skeletons}>
        <View style={styles.header}>
          <Skeleton width={144} height={16} />
          <Skeleton width={224} height={24} radius={radii.full} />
          <Skeleton height={36} radius={radii.xl} />
        </View>
        <Skeleton height={144} radius={radii['2xl']} />
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} height={176} radius={radii['2xl']} />
        ))}
      </View>
    </Screen>
  );
}

/** "Go to your claims": back to the tabs, on the Your claims tab. */
function GoToYourClaims() {
  const router = useRouter();
  return (
    <Button label={copy.goToYourClaims.text} variant="secondary" onPress={() => router.dismissTo('/dashboard')} fullWidth />
  );
}

/** The text for a load that failed without an answer the screen knows (network, session, malformed). */
function failureBody(error: unknown): string {
  const shown = userFacingError(error);
  // A malformed answer or a session hiccup gets the web's "on our side"; the
  // network message and the server's own text (such as auth_unavailable) show as sent.
  if (!shown || shown.code === 'invalid_response' || shown.code === 'session_error' || shown.code === 'session_rejected') {
    return common.loadErrorBody.text;
  }
  return shown.message;
}

/** The screen could not load at all (src/app/claim/[slug]/error.tsx). */
export function ClaimLoadFailed({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) {
  return (
    <Screen centered testID="claim-load-failed">
      <ErrorState onRetry={onRetry} retrying={retrying} body={failureBody(error)} secondaryAction={<GoToYourClaims />} />
    </Screen>
  );
}

/** 503 load_error: the settlement or the claim could not be read (page.tsx LoadError). Never a 404. */
export function ClaimLoadError({
  what,
  onRetry,
  retrying,
}: {
  what: string | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <Screen centered testID="claim-load-error">
      <ErrorState
        onRetry={onRetry}
        retrying={retrying}
        title={loadErrorTitle(what, common.loadErrorTitle.text)}
        body={copy.loadErrorBody.text}
        secondaryAction={<GoToYourClaims />}
      />
    </Screen>
  );
}

/** 404: the root not-found copy (src/app/not-found.tsx), as the app's +not-found screen shows it. */
export function ClaimNotFound() {
  const router = useRouter();
  return (
    <Screen centered testID="claim-not-found">
      <EmptyState
        icon={Compass}
        title={app.notFoundTitle.text}
        body={app.notFoundBody.text}
        action={
          <Button
            label={app.browseOpenSettlements.text}
            icon={Search}
            onPress={() => router.dismissTo('/lawsuits')}
            fullWidth
          />
        }
      />
    </Screen>
  );
}

/**
 * 401: the claim log-in prompt (src/app/login/page.tsx), coming back to this
 * claim. `loggedOut`: the session ended under the person (this load, or a
 * claim write that found it dead), so the prompt says "You were logged out."
 */
export function ClaimSignedOut({ slug, loggedOut }: { slug: string; loggedOut: boolean }) {
  return (
    <Screen centered testID="claim-signed-out">
      <SignedOutPrompt next={claimHref(slug)} loggedOut={loggedOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space[3],
  },
  skeletons: {
    gap: space[5],
  },
});
