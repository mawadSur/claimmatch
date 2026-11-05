import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { AppText, Button, Notice, Screen, TextField } from '@/components/ui';
import { Trash } from '@/components/ui/icons';
import { settings } from '@/copy/settings';
import { userFacingError } from '@/data/errors';
import { useDeleteAccount } from '@/data/profile';
import { SignedOutPrompt } from '@/features/shared';
import { useAuth } from '@/providers/AuthProvider';

/** What the person must type (src/components/DeleteAccount.tsx). */
const CONFIRM_WORD = 'DELETE';

/**
 * /delete-account, a modal (src/components/DeleteAccount.tsx; plan 5, Apple
 * 5.1.1(v)). Explains what is removed and stays disabled until DELETE is
 * typed. On success: signs out on this device, which drops personal data from
 * memory and cancels reminders, and returns to the settlements list. Errors
 * (including the 429 rate limit) show the server's text.
 */
export function DeleteAccountScreen() {
  const router = useRouter();
  const { status, signOut, sessionEnded } = useAuth();
  const remove = useDeleteAccount();
  const [confirm, setConfirm] = useState('');
  const [finishing, setFinishing] = useState(false);
  const ready = confirm === CONFIRM_WORD;
  const busy = remove.isPending || finishing;

  async function deleteAccount() {
    if (!ready || busy) return;
    Keyboard.dismiss();
    try {
      await remove.mutateAsync({ confirm });
    } catch {
      return; // Shown from remove.error.
    }
    setFinishing(true);
    // useDeleteAccount has cancelled the reminders. Signing out removes the session from this
    // device, drops every personal query and mutation from memory and cancels reminders again.
    await signOut();
    router.dismissTo('/lawsuits');
  }

  // Signed out in the middle of deleting is expected; otherwise there is nothing to delete.
  if (status !== 'signedIn' && !finishing) {
    return (
      <Screen centered>
        <SignedOutPrompt loggedOut={sessionEnded} />
      </Screen>
    );
  }

  const failure = remove.isError ? userFacingError(remove.error) : null;

  return (
    <Screen
      footer={
        <>
          {failure ? <Notice tone="error" body={failure.message} testID="delete-error" /> : null}
          <Button
            label={busy ? settings.deleting.text : settings.deleteTitle.text}
            variant="danger"
            icon={Trash}
            loading={busy}
            disabled={!ready}
            onPress={() => void deleteAccount()}
            fullWidth
            testID="delete-submit"
          />
        </>
      }
      testID="delete-account"
    >
      <AppText variant="body" color="textMuted">
        {settings.deleteBody.text}
      </AppText>
      <TextField
        label={settings.deleteInputLabel.text}
        value={confirm}
        onChangeText={(value) => {
          setConfirm(value);
          if (remove.isError) remove.reset();
        }}
        placeholder={settings.deletePlaceholder.text}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={() => void deleteAccount()}
        disabled={busy}
        testID="delete-confirm"
      />
    </Screen>
  );
}
