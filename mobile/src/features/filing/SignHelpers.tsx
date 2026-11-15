import type { ClaimFilingView } from '@shared/lib/filing/v2/contract';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, CheckboxRow, FieldError, TextField, TextLink } from '@/components/ui';
import { KeyRound } from '@/components/ui/icons';
import { filing as copy, versionText } from '@/copy/filing';
import { useAuth } from '@/providers/AuthProvider';

import { giveEsignConsent } from './api';
import { Message, Muted, Quote, SubHeading, filingStyles } from './parts';

/**
 * E-SIGN consent (the web's EsignConsent), asked once per text version
 * before the member's first electronic signature. The text is the server's;
 * the member ticks the box themselves, then agrees.
 */
export function EsignConsent({
  view,
  busy,
  onAgreed,
}: {
  view: ClaimFilingView;
  busy: boolean;
  onAgreed: (message: string) => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (view.esign.consented) return <Message tone="success" text={copy.esignDone.text} />;

  async function agree() {
    setError(null);
    if (!checked) return setError(copy.esignTick.text);
    setSaving(true);
    const result = await giveEsignConsent(view.claim.id, view.esign.text_version);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    await onAgreed(copy.esignDone.text);
  }

  return (
    <View style={filingStyles.section} testID="filing-esign">
      <SubHeading text={copy.esignTitle.text} />
      <Quote text={view.esign.text} />
      <Muted>{versionText(view.esign.text_version)}</Muted>
      <CheckboxRow
        appearance="plain"
        label={copy.esignCheckbox.text}
        checked={checked}
        onChange={setChecked}
        disabled={busy || saving}
        testID="filing-esign-checkbox"
      />
      <FieldError message={error} />
      <Button
        variant="secondary"
        label={saving ? copy.saving.text : copy.esignAgree.text}
        loading={saving}
        disabled={busy || saving}
        onPress={() => void agree()}
        testID="filing-esign-agree"
      />
    </View>
  );
}

/**
 * "For your security, sign in again" (the web's ReauthPrompt): signing a
 * claim needs a password sign-in in the last 15 minutes (an email link never
 * counts). The member signs in again here with the account's email and
 * password, which gives the app a fresh session; members without a password
 * set one through the app's reset-password screens.
 */
export function ReauthPrompt({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const { user, signInWithPassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'done'>('idle');
  const email = user?.email ?? null;

  async function submit() {
    setError(null);
    if (!password) return setError(copy.reauthEnter.text);
    if (!email) return setError(copy.reauthWrong.text);
    setStatus('checking');
    try {
      const { error: signInError } = await signInWithPassword(email, password);
      if (signInError) {
        setStatus('idle');
        return setError(copy.reauthWrong.text);
      }
    } catch {
      setStatus('idle');
      return setError(copy.network.text);
    }
    setPassword('');
    setStatus('done');
    await onSignedIn();
  }

  if (status === 'done') return <Message tone="success" text={copy.reauthDone.text} testID="filing-reauth-done" />;

  return (
    <View style={filingStyles.warning} testID="filing-reauth">
      <SubHeading text={copy.reauthTitle.text} />
      <Muted>{copy.reauthBody.text}</Muted>
      <TextField
        label={copy.reauthPassword.text}
        icon={KeyRound}
        secure
        value={password}
        onChangeText={setPassword}
        error={error}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="filing-reauth-password"
      />
      <Button
        label={status === 'checking' ? copy.reauthChecking.text : copy.reauthSubmit.text}
        loading={status === 'checking'}
        onPress={() => void submit()}
        testID="filing-reauth-submit"
      />
      <Muted>{copy.reauthNoPassword.text}</Muted>
      <TextLink label={copy.reauthSetPassword.text} onPress={() => router.push('/forgot-password')} />
    </View>
  );
}
