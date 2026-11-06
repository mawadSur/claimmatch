import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, type TextInputInstance } from 'react-native';

import { AppText, Button, Card, Icon, Notice, Screen, TextField } from '@/components/ui';
import { ArrowRight, CircleCheck, Lock, Mail, User } from '@/components/ui/icons';
import { auth, newPasswordPlaceholder, passwordTooShortText } from '@/copy/auth';
import { common } from '@/copy/common';
import { WEB_LINKS } from '@/features/settings/links';
import { ExternalTextLink, loginHref, safeNextPath } from '@/features/shared';
import { showsFeeDisclosure } from '@/lib/flags';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/ConfigProvider';
import { space } from '@/theme/tokens';

import {
  authErrorText,
  isEmailShaped,
  markSessionFlags,
  MIN_PASSWORD_LENGTH,
  thrownAuthErrorText,
  withTimeout,
} from './auth-helpers';
import { checkEmailHref } from './CheckEmailScreen';
import { afterSignInHref } from './navigation';
import { AuthHeader, SwitchPrompt } from './parts';

/**
 * /signup (src/app/signup/page.tsx and AuthForm in sign-up mode). Creates the
 * account with the name as `full_name` metadata (the profile trigger reads
 * it) and the website's /auth/callback as the email link. With email
 * confirmation on, Supabase answers without a session and Check your email
 * opens over this form, so "try a different email" comes back to it.
 */
export function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = safeNextPath(params.next);
  const { signUp } = useAuth();
  const config = useConfig();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const bullets = [
    showsFeeDisclosure(config) ? auth.bulletOfficialFilingFree.text : auth.bulletFreeDuringBeta.text,
    auth.bulletBrowse.text,
    auth.bulletKeepTrack.text,
  ];

  async function submit() {
    if (loading) return;
    setFormError(null);
    const emailProblem = isEmailShaped(email) ? null : auth.enterYourEmail.text;
    const passwordProblem = password.length < MIN_PASSWORD_LENGTH ? passwordTooShortText(MIN_PASSWORD_LENGTH) : null;
    setEmailError(emailProblem);
    setPasswordError(passwordProblem);
    if (emailProblem || passwordProblem) return;

    Keyboard.dismiss();
    // Only the button waits: fields that turn non-editable read to iOS as a
    // finished sign-up, and it would offer to save a password for an account
    // that may not be created (see LoginScreen).
    setLoading(true);
    try {
      const { data, error } = await withTimeout(signUp({ email, password, fullName }));
      if (error) {
        setFormError(authErrorText(error));
        setLoading(false);
        return;
      }
      if (data.session) {
        // Email confirmation is off: signed in already. Onboarding opens next (root layout gate).
        markSessionFlags();
        router.dismissTo(afterSignInHref(next));
        return;
      }
      setLoading(false);
      router.push(checkEmailHref(email, next));
    } catch (caught) {
      setFormError(thrownAuthErrorText(caught));
      setLoading(false);
    }
  }

  return (
    <Screen hasTextFields>
      <AuthHeader title={auth.signupTitle.text} body={auth.signupIntro.text} />
      <View style={styles.bullets}>
        {bullets.map((bullet) => (
          <View key={bullet} style={styles.bullet}>
            <Icon icon={CircleCheck} size="md" color="successIcon" />
            <AppText variant="caption" color="textMuted" style={styles.bulletText}>
              {bullet}
            </AppText>
          </View>
        ))}
      </View>

      <Card style={styles.form}>
        <TextField
          label={auth.fullNameLabel.text}
          icon={User}
          value={fullName}
          onChangeText={setFullName}
          placeholder={auth.fullNamePlaceholder.text}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          maxLength={120}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          testID="signup-name"
        />
        <TextField
          ref={emailRef}
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
          // "username" lets iOS save the new password under this email.
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="signup-email"
        />
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
          placeholder={newPasswordPlaceholder(MIN_PASSWORD_LENGTH)}
          error={passwordError}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules={`minlength: ${MIN_PASSWORD_LENGTH};`}
          returnKeyType="go"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submit()}
          testID="signup-password"
        />
        {formError ? <Notice tone="error" body={formError} testID="signup-error" /> : null}
        <Button
          label={loading ? auth.creatingAccount.text : auth.createMyAccount.text}
          icon={ArrowRight}
          iconPosition="trailing"
          loading={loading}
          onPress={() => void submit()}
          fullWidth
          testID="signup-submit"
        />
      </Card>

      <SwitchPrompt
        prompt={auth.alreadyHaveAccount.text}
        link={common.logIn.text}
        onPress={() => router.replace(loginHref(next))}
      />

      <View style={styles.agreement}>
        <AppText variant="caption" color="textMuted">
          {`${auth.agreeLead.text} ${auth.terms.text} ${auth.and.text} ${auth.privacyPolicy.text}.`}
        </AppText>
        <View style={styles.links}>
          <ExternalTextLink url={WEB_LINKS.terms} label={auth.terms.text} testID="signup-terms" />
          <ExternalTextLink url={WEB_LINKS.privacy} label={auth.privacyPolicy.text} testID="signup-privacy" />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullets: {
    gap: space[2],
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  bulletText: {
    flex: 1,
  },
  form: {
    gap: space[4],
  },
  agreement: {
    gap: space[1],
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space[5],
  },
});
