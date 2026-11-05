import { confirmationNumberSchema } from '@shared/lib/claims';
import type { Ref } from 'react';
import type { TextInputInstance } from 'react-native';

import { TextField } from '@/components/ui';
import { claim as copy } from '@/copy/claim';

export type NumberCheck = { ok: true; value: string | undefined } | { ok: false; error: string };

/**
 * Checks a confirmation number with the same rules as the server
 * (src/components/claims/ConfirmationNumberField.tsx). Empty is fine unless
 * the number is required.
 */
export function checkConfirmationNumber(raw: string, required: boolean): NumberCheck {
  if (raw.trim() === '') {
    return required ? { ok: false, error: copy.enterNumber.text } : { ok: true, value: undefined };
  }
  const parsed = confirmationNumberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? copy.checkNumber.text };
  return { ok: true, value: parsed.data };
}

export interface ConfirmationNumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  inputRef?: Ref<TextInputInstance>;
  onSubmit?: () => void;
  testID?: string;
}

/** The administrator's confirmation number, with the web's help text. */
export function ConfirmationNumberField({
  value,
  onChange,
  error,
  required = false,
  inputRef,
  onSubmit,
  testID,
}: ConfirmationNumberFieldProps) {
  return (
    <TextField
      label={copy.confirmationNumber.text}
      labelSuffix={required ? undefined : copy.optional.text}
      hint={copy.numberHelp.text}
      error={error}
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      maxLength={64}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      textContentType="none"
      returnKeyType="done"
      onSubmitEditing={onSubmit}
      testID={testID}
    />
  );
}
