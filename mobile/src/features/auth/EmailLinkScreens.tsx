import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { CircleAlert, Lock, MailCheck } from '@/components/ui/icons';
import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { firstParam, safeNextPath } from '@/features/shared';
import { getSupabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

import { markSessionFlags, withTimeout } from './auth-helpers';
import {
  afterEmailConfirmed,
  confirmFailureHref,
  loginWith,
  parseAuthCode,
  parseConfirmType,
  parseTokenHash,
} from './email-links';
import { checkedHref } from './navigation';
import { AuthHeader } from './parts';

type LinkParams = {
  token_hash?: string | string[];
  type?: string | string[];
  next?: string | string[];
  code?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
};

/**
 * /auth/confirm (src/app/auth/confirm/page.tsx), M8 universal link.
 * Scanner-safe like the web: opening the screen changes nothing; the one-time
 * token is used only when the person presses the button.
 */
export function ConfirmEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<LinkParams>();
  const tokenHash = parseTokenHash(firstParam(params.token_hash));
  const type = parseConfirmType(firstParam(params.type));
  const next = safeNextPath(params.next);
  const recovery = type === 'recovery';
  const [verifying, setVerifying] = useState(false);

  if (!tokenHash || !type) {
    return (
      <Screen>
        <AuthHeader
          icon={CircleAlert}
          iconTone="danger"
          title={auth.linkIncompleteTitle.text}
          body={auth.linkIncompleteBody.text}
        />
        <Button
          label={recovery ? auth.requestNewResetLink.text : auth.goToLogIn.text}
          variant="secondary"
          onPress={() => router.dismissTo(recovery ? '/forgot-password' : '/login')}
          fullWidth
        />
      </Screen>
    );
  }

  async function verify(hash: string, linkType: NonNullable<typeof type>) {
    if (verifying) return;
    setVerifying(true);
    let failed = true;
    try {
      const { data, error } = await withTimeout(getSupabase().auth.verifyOtp({ token_hash: hash, type: linkType }));
      failed = Boolean(error);
      if (!error && data.user) markSessionFlags();
    } catch {
      failed = true;
    }
    if (failed) {
      router.dismissTo(confirmFailureHref(linkType));
      return;
    }
    router.dismissTo(linkType === 'recovery' ? '/reset-password' : afterEmailConfirmed(next));
  }

  return (
    <Screen>
      <AuthHeader
        icon={recovery ? Lock : MailCheck}
        title={recovery ? auth.resetYourPassword.text : auth.confirmYourEmail.text}
        body={recovery ? auth.pressToReset.text : auth.pressToConfirm.text}
      />
      <Button
        label={recovery ? auth.continueToReset.text : auth.confirmMyEmail.text}
        loading={verifying}
        onPress={() => void verify(tokenHash, type)}
        fullWidth
        testID="confirm-link"
      />
    </Screen>
  );
}

/**
 * /auth/callback (src/app/auth/callback/route.ts), M8 universal link. Starts
 * the session from the email's PKCE code. When that fails (the link was opened
 * on another device, or used twice) the email is still confirmed, so the
 * person logs in; an expired or invalid link says so on the log-in screen.
 */
export function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<LinkParams>();
  const started = useRef(false);
  const code = parseAuthCode(firstParam(params.code));
  const linkError = Boolean(firstParam(params.error) || firstParam(params.error_code));
  const next = safeNextPath(params.next);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) {
      // As the web route: an error from Supabase is an expired link; otherwise continue (onboarding by default).
      router.dismissTo(linkError ? loginWith({ linkExpired: true }, next) : next ? checkedHref(next) : '/onboarding');
      return;
    }
    void (async () => {
      let failed = true;
      try {
        const { data, error } = await withTimeout(getSupabase().auth.exchangeCodeForSession(code));
        failed = Boolean(error);
        if (!error && data.user) markSessionFlags();
      } catch {
        failed = true;
      }
      router.dismissTo(failed ? loginWith({ confirmed: true }, next) : afterEmailConfirmed(next));
    })();
  }, [code, linkError, next, router]);

  return (
    <Screen centered>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={common.loading.text} style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    paddingVertical: space[8],
  },
});
