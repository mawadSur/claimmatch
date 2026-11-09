import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInputInstance } from 'react-native';

import { AppText, Button, Card, Notice, Screen, TextField, TextLink } from '@/components/ui';
import { ArrowRight, Lock, Mail } from '@/components/ui/icons';
import { auth } from '@/copy/auth';
import { common } from '@/copy/common';
import { shared } from '@/copy/shared';
import { firstParam, safeNextPath, signupHref } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

import {
  authErrorText,
  isEmailShaped,
  markSessionFlags,
  thrownAuthErrorText,
  withTimeout,
} from './auth-helpers';
import { afterSignInHref } from './navigation';
import { AuthHeader, SwitchPrompt } from './parts';

type LoginParams = { next?: string | string[]; confirmed?: string | string[]; link?: string | string[] };

/**
 * /login (src/app/login/page.tsx and AuthForm in login mode). A checked
 * `next` (a claim, a settlement or a tab) is where the person returns after
 * logging in; without one, Your claims. Opened from a claim, it greets new
 * people with "Log in or create a free account". `confirmed=1` and
 * `link=expired` show the web's banners after an email link.
 */
export function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<LoginParams>();
  const next = safeNextPath(params.next);
  const fromClaim = next?.startsWith('/claim/') ?? false;
  const confirmed = firstParam(params.confirmed) === '1';
  const linkExpired = firstParam(params.link) === 'expired';
  const { signInWithPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (loading) return;
    setFormError(null);
    const emailProblem = isEmailShaped(email) ? null : auth.enterSignUpEmail.text;
    const passwordProblem = password ? null : auth.enterYourPassword.text;
    setEmailError(emailProblem);
    setPasswordError(passwordProblem);
    if (emailProblem || passwordProblem) return;

    Keyboard.dismiss();
    // Only the button waits. The fields stay editable: iOS Password AutoFill
    // reads fields that turn non-editable as a finished sign-in and offers to
    // save the password before the server has checked it.
    setLoading(true);
    try {
      const { data, error } = await withTimeout(signInWithPassword(email, password));
      if (error) {
        setFormError(authErrorText(error));
        setLoading(false);
        return;
      }
      if (data.user) markSessionFlags();
      // Closes the sign-in sheet and opens where the person came from.
      router.dismissTo(afterSignInHref(next));
    } catch (caught) {
      setFormError(thrownAuthErrorText(caught));
      setLoading(false);
    }
  }

  const confirmedText = `${auth.emailConfirmed.text}${fromClaim ? ` ${auth.toYourClaim.text}` : ''}.`;

  return (
    <Screen hasTextFields>
      <AuthHeader
        title={fromClaim ? shared.claimLoginTitle.text : shared.welcomeBack.text}
        body={fromClaim ? shared.claimLoginBody.text : shared.logInToSeeClaims.text}
      />
      {confirmed ? <Notice tone="success" body={confirmedText} testID="login-confirmed" /> : null}
      {linkExpired ? <Notice tone="unverified" body={auth.confirmLinkExpired.text} announce testID="login-link-expired" /> : null}

      <Card style={styles.form}>
        <TextField
          label={auth.emailLabel.text}
          icon={Mail}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(null);
          }}
          placeholder={auth.emailPlaceholder.text}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          // "username" pairs the field with the password for iOS Password AutoFill.
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="login-email"
        />
        <View>
          <TextField
            ref={passwordRef}
            label={auth.passwordLabel.text}
            icon={Lock}
            secure
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setPasswordError(null);
            }}
            placeholder={auth.passwordPlaceholder.text}
            error={passwordError}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void submit()}
            testID="login-password"
          />
          <TextLink
            label={auth.forgotPasswordLink.text}
            onPress={() => router.push('/forgot-password')}
            style={styles.forgot}
            testID="login-forgot"
          />
        </View>
        {formError ? <Notice tone="error" body={formError} testID="login-error" /> : null}
        <Button
          label={loading ? auth.signingIn.text : common.logIn.text}
          icon={ArrowRight}
          iconPosition="trailing"
          loading={loading}
          onPress={() => void submit()}
          fullWidth
          testID="login-submit"
        />
      </Card>

      {/* From a claim, "Create a free account" below already offers sign-up, so the link would repeat it. */}
      {fromClaim ? null : (
        <SwitchPrompt
          prompt={shared.newToClaimMatch.text}
          link={auth.createAnAccount.text}
          onPress={() => router.replace(signupHref(next))}
        />
      )}

      {fromClaim ? (
        <View style={styles.newAccount}>
          <AppText variant="caption" color="textMuted" align="center">
            {shared.newToClaimMatch.text}
          </AppText>
          <Button
            label={shared.createFreeAccount.text}
            variant="secondary"
            onPress={() => router.replace(signupHref(next))}
            fullWidth
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  newAccount: {
    gap: space[2],
  },
});
