import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, type TextInputInstance } from 'react-native';

import { Button, Card, Notice, Screen, TextField } from '@/components/ui';
import { Lock } from '@/components/ui/icons';
import { auth, newPasswordPlaceholder, passwordTooShortText } from '@/copy/auth';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space } from '@/theme/tokens';

import { MIN_PASSWORD_LENGTH, withTimeout } from './auth-helpers';
import { AuthHeader } from './parts';

/**
 * /reset-password (src/app/reset-password/page.tsx and ResetPasswordForm),
 * M8: reached from a verified recovery link, which signs the person in. Signed
 * out, it sends them to request a new link, as the web does. Once saved, it
 * goes to Your claims with ?password=updated, which shows "Your password was
 * updated." there (ResetPasswordForm's /dashboard?password=updated).
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (status === 'signedOut') router.replace({ pathname: '/forgot-password', params: { link: 'expired' } });
  }, [status, router]);

  async function submit() {
    if (saving) return;
    setFormError(null);
    // The checks of ResetPasswordForm's validateNewPassword, each shown under its field.
    const tooShort = password.length < MIN_PASSWORD_LENGTH;
    setPasswordError(tooShort ? passwordTooShortText(MIN_PASSWORD_LENGTH) : null);
    setConfirmError(!tooShort && password !== confirm ? auth.passwordsDontMatch.text : null);
    if (tooShort || password !== confirm) return;
    Keyboard.dismiss();
    // Only the button waits: fields that turn non-editable read to iOS as a
    // finished change, and it would offer to save a password the server may
    // still refuse (see LoginScreen).
    setSaving(true);
    try {
      const { error: failed } = await withTimeout(getSupabase().auth.updateUser({ password }));
      if (failed) {
        setFormError(auth.updatePasswordFailed.text);
        return;
      }
      setPassword('');
      setConfirm('');
      router.dismissTo({ pathname: '/dashboard', params: { password: 'updated' } });
    } catch {
      setFormError(auth.updatePasswordFailed.text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen hasTextFields>
      <AuthHeader title={auth.resetTitle.text} body={auth.resetIntro.text} />
      <Card style={styles.form}>
        <TextField
          label={auth.newPasswordLabel.text}
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
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          testID="reset-password"
        />
        <TextField
          ref={confirmRef}
          label={auth.confirmPasswordLabel.text}
          icon={Lock}
          secure
          value={confirm}
          onChangeText={(value) => {
            setConfirm(value);
            setConfirmError(null);
          }}
          error={confirmError}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void submit()}
          testID="reset-confirm"
        />
        {formError ? <Notice tone="error" body={formError} testID="reset-error" /> : null}
        <Button label={auth.saveNewPassword.text} loading={saving} onPress={() => void submit()} fullWidth />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
});
