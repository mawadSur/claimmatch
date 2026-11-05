import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet } from 'react-native';

import { AppText, Button, Card, Notice, Screen, TextField, TextLink } from '@/components/ui';
import { Mail, MailCheck } from '@/components/ui/icons';
import { auth } from '@/copy/auth';
import { firstParam } from '@/features/shared';
import { useAnnounce } from '@/hooks/use-announce';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

import { isEmailShaped, withTimeout } from './auth-helpers';
import { AuthHeader } from './parts';

/**
 * /forgot-password (src/app/forgot-password/page.tsx and ForgotPasswordForm).
 * Asks Supabase to email a reset link, and always says the same thing, so it
 * never reveals whether an account exists. Only a rate limit or a request
 * that did not get through is shown as an error. The link finishes on the
 * website in v1.
 */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ link?: string | string[] }>();
  const linkExpired = firstParam(params.link) === 'expired';
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');

  async function submit() {
    if (status === 'loading') return;
    setError(null);
    if (!isEmailShaped(email)) {
      setError(auth.enterSignUpEmail.text);
      return;
    }
    Keyboard.dismiss();
    setStatus('loading');
    try {
      const { error: failed } = await withTimeout(resetPasswordForEmail(email));
      if (failed && failed.status === 429) {
        setError(auth.tooManyRequests.text);
        setStatus('idle');
        return;
      }
      if (failed && isAuthRetryableFetchError(failed)) {
        setError(auth.checkConnection.text);
        setStatus('idle');
        return;
      }
      setStatus('sent');
    } catch {
      setError(auth.checkConnection.text);
      setStatus('idle');
    }
  }

  const backToLogIn = () => router.dismissTo('/login');
  const sentMessage = `${auth.ifAnAccountUses.text} ${email.trim()}${auth.weSentResetLink.text}`;
  // The web's role="status": the result is read out when it replaces the form.
  useAnnounce(status === 'sent' ? `${auth.checkEmailTitle.text}. ${sentMessage}` : null);

  if (status === 'sent') {
    return (
      <Screen>
        <AuthHeader icon={MailCheck} title={auth.checkEmailTitle.text} body={sentMessage} />
        <AppText variant="bodyStrong">{auth.backToApp.text}</AppText>
        <Button label={auth.backToLogIn.text} onPress={backToLogIn} fullWidth testID="forgot-back" />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader title={auth.forgotTitle.text} body={auth.forgotIntro.text} />
      {linkExpired ? <Notice tone="unverified" body={auth.resetLinkExpired.text} announce /> : null}
      <Card style={styles.form}>
        <TextField
          label={auth.emailLabel.text}
          icon={Mail}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder={auth.emailPlaceholder.text}
          error={error}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submit()}
          disabled={status === 'loading'}
          testID="forgot-email"
        />
        <Button
          label={auth.emailResetLink.text}
          loading={status === 'loading'}
          onPress={() => void submit()}
          fullWidth
          testID="forgot-submit"
        />
      </Card>
      <TextLink label={auth.backToLogIn.text} onPress={backToLogIn} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
});
