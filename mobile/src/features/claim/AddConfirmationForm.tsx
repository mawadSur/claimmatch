import type { ClaimView } from '@shared/lib/claims';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/ui';
import { claim as copy } from '@/copy/claim';
import { space } from '@/theme/tokens';

import { ClaimError } from './ClaimError';
import { ConfirmationNumberField, checkConfirmationNumber } from './ConfirmationNumberField';
import { useClaimWrites } from './use-claim-writes';

export interface AddConfirmationFormProps {
  claimId: string;
  initialValue?: string;
  submitLabel?: string;
  /** What screen readers say for the button, when the label alone is ambiguous (a list of claims). */
  submitAccessibilityLabel?: string;
  onSaved: (claim: ClaimView, message: string) => void;
  onCancel?: () => void;
}

/**
 * Adds (or corrects) the administrator's confirmation number
 * (src/components/claims/AddConfirmationForm.tsx). With a number, a reported
 * claim becomes "Submitted · #number". Used on the claim screen and in the
 * dashboard's corrective notice after "I already filed".
 */
export function AddConfirmationForm({
  claimId,
  initialValue = '',
  submitLabel = copy.addNumber.text,
  submitAccessibilityLabel,
  onSaved,
  onCancel,
}: AddConfirmationFormProps) {
  const writes = useClaimWrites();
  const [value, setValue] = useState(initialValue);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (busy) return;
    const check = checkConfirmationNumber(value, true);
    if (!check.ok || !check.value) {
      setFieldError(check.ok ? copy.enterNumber.text : check.error);
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      const result = await writes.changeClaim({
        claimId,
        body: { action: 'add_confirmation', confirmation_number: check.value },
      });
      setBusy(false);
      onSaved(result.claim, copy.savedNowSubmitted.text);
    } catch (caught) {
      setBusy(false);
      setError(caught);
    }
  }

  return (
    <View style={styles.form}>
      <ConfirmationNumberField
        value={value}
        onChange={setValue}
        error={fieldError}
        required
        inputRef={inputRef}
        onSubmit={() => void submit()}
        testID="claim-add-number"
      />
      <View style={styles.actions}>
        <Button
          label={busy ? copy.saving.text : submitLabel}
          accessibilityLabel={busy ? undefined : submitAccessibilityLabel}
          loading={busy}
          onPress={() => void submit()}
          fullWidth
        />
        {onCancel ? (
          <Button label={copy.cancel.text} variant="ghost" disabled={busy} onPress={onCancel} fullWidth />
        ) : null}
      </View>
      <ClaimError error={error} testID="claim-add-number-error" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[3],
  },
  actions: {
    gap: space[2],
  },
});
