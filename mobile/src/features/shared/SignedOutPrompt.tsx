import { useRouter } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Button, EmptyState, Notice } from '@/components/ui';
import { LogIn } from '@/components/ui/icons';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import { space } from '@/theme/tokens';

import { loginHref, safeNextPath, signupHref } from './hrefs';

export interface SignedOutPromptProps {
  /**
   * Where to come back after logging in, such as "/dashboard" or
   * "/claim/{slug}". Checked with safeNextPath; anything else is dropped.
   */
  next?: string | null;
  /**
   * The session ended without the person signing out (useAuth().sessionEnded,
   * or a request that signed them out): say "You were logged out." above the
   * prompt, as the web's ClaimError does, so the screen does not change
   * without a reason.
   */
  loggedOut?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The signed-out state of a personal screen, worded like the web's log-in
 * page (src/app/login/page.tsx). The title is "Log in or create a free
 * account": the Your claims tab shows this to everyone, first-time visitors
 * included, and the web keeps "Welcome back" from people who are likely new.
 * "Welcome back" stays for someone whose session just ended. A claim (a
 * `next` under /claim/) gets the web's claim body. Log in and Create a free
 * account open the auth screens with the checked `next` path.
 */
export function SignedOutPrompt({ next, loggedOut = false, style, testID }: SignedOutPromptProps) {
  const router = useRouter();
  const safeNext = safeNextPath(next);
  const fromClaim = safeNext?.startsWith('/claim/') ?? false;
  const returning = loggedOut && !fromClaim;
  const prompt = (
    <EmptyState
      icon={LogIn}
      title={returning ? shared.welcomeBack.text : shared.claimLoginTitle.text}
      body={fromClaim ? shared.claimLoginBody.text : shared.logInToSeeClaims.text}
      style={loggedOut ? undefined : style}
      testID={testID}
      action={
        <>
          <Button label={common.logIn.text} icon={LogIn} onPress={() => router.push(loginHref(safeNext))} fullWidth />
          <AppText variant="caption" color="textMuted" align="center">
            {shared.newToClaimMatch.text}
          </AppText>
          <Button
            label={shared.createFreeAccount.text}
            variant="secondary"
            onPress={() => router.push(signupHref(safeNext))}
            fullWidth
          />
        </>
      }
    />
  );
  if (!loggedOut) return prompt;
  return (
    <View style={[styles.stack, style]}>
      <Notice tone="info" body={common.loggedOut.text} announce testID="signed-out-logged-out" />
      {prompt}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[4],
  },
});
