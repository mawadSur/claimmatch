import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, TextLink } from '@/components/ui';
import { LogIn, MailCheck } from '@/components/ui/icons';
import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { loginHref, safeNextPath, signupHref } from '@/features/shared';
import { space } from '@/theme/tokens';

import { isEmailShaped } from './auth-helpers';
import { AuthHeader } from './parts';

/** The longest address an email system accepts (RFC 5321 path limit). */
const MAX_EMAIL_LENGTH = 254;

/**
 * The address the last sign-up on this device sent its link to. It is
 * handed over in memory, never in the URL: any website or app can open
 * claimmatch://check-email?…, so nothing from the URL is printed on screen.
 */
let signupEmail: string | null = null;

/** Opens Check your email for the address just signed up with, keeping the checked `next`. */
export function checkEmailHref(email: string, next: string | null): Href {
  const trimmed = email.trim();
  signupEmail = isEmailShaped(trimmed) && trimmed.length <= MAX_EMAIL_LENGTH ? trimmed : null;
  return next ? { pathname: '/check-email', params: { next } } : '/check-email';
}

/**
 * /check-email: AuthForm's check-email state, after a sign-up that needs the
 * email link. In v1 the link finishes on the website (plan section 4), so the
 * app-only line sends the person back here to log in, keeping the checked
 * `next`. "try a different email" returns to the sign-up form underneath.
 * Opened any other way (a link from outside the app), it names no address.
 */
export function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = safeNextPath(params.next);
  // Read once: the screen keeps the address it opened with.
  const [email] = useState(signupEmail);

  const sent = email ? `${auth.sentConfirmationTo.text} ${email}. ${auth.openItToVerify.text}` : auth.openItToVerify.text;

  return (
    <Screen>
      <AuthHeader icon={MailCheck} iconTone="success" title={auth.checkEmailTitle.text} body={sent} />
      <AppText variant="bodyStrong">{auth.backToApp.text}</AppText>
      <Button
        label={common.logIn.text}
        icon={LogIn}
        onPress={() => router.replace(loginHref(next))}
        fullWidth
        testID="check-email-log-in"
      />
      <View style={styles.retry}>
        <AppText variant="caption" color="textSoft">
          {auth.didntGetIt.text}
        </AppText>
        <TextLink
          label={auth.tryDifferentEmail.text}
          onPress={() => router.dismissTo(signupHref(next))}
          testID="check-email-retry"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  retry: {
    gap: 0,
    paddingTop: space[2],
  },
});
