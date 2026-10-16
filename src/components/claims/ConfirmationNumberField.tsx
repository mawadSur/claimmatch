'use client';

import { confirmationNumberSchema } from '@/lib/claims';

/**
 * Checks a confirmation number with the same rules as the server. Empty is
 * fine unless the number is required.
 */
export function checkConfirmationNumber(
  raw: string,
  required: boolean,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (raw.trim() === '') {
    return required ? { ok: false, error: 'Enter your confirmation number.' } : { ok: true, value: undefined };
  }
  const parsed = confirmationNumberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the number.' };
  return { ok: true, value: parsed.data };
}

export function ConfirmationNumberField({
  id,
  value,
  onChange,
  error,
  required = false,
  label = 'Confirmation number',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  label?: string;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {!required && <span className="font-normal text-ink-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        name="confirmation_number"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={64}
        className="field-input sm:max-w-md"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        aria-invalid={error ? true : undefined}
        required={required}
      />
      <p id={helpId} className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        You&rsquo;ll find it on the last page after you submit, or in the email from
        the settlement administrator. It may be called a claim ID, claim number or
        confirmation code.
      </p>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
