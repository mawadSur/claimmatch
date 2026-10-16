'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type { ClaimView } from '@/lib/claims';
import { updateClaim } from './claim-api';
import { ConfirmationNumberField, checkConfirmationNumber } from './ConfirmationNumberField';

/**
 * Adds (or corrects) the administrator's confirmation number. With a number,
 * a reported claim becomes "Submitted · #number".
 */
export function AddConfirmationForm({
  claimId,
  initialValue = '',
  submitLabel = 'Add number',
  onSaved,
  onCancel,
}: {
  claimId: string;
  initialValue?: string;
  submitLabel?: string;
  onSaved: (claim: ClaimView, message: string) => void;
  onCancel?: () => void;
}) {
  const posthog = usePostHog();
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = checkConfirmationNumber(value, true);
    if (!check.ok) {
      setFieldError(check.error);
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    const result = await updateClaim(claimId, {
      action: 'add_confirmation',
      confirmation_number: check.value,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    posthog?.capture('claim_confirmation_added');
    onSaved(result.claim, 'Saved. Your claim now shows as submitted with your confirmation number.');
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <ConfirmationNumberField
        id={`${id}-confirmation`}
        value={value}
        onChange={setValue}
        error={fieldError}
        required
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </form>
  );
}
