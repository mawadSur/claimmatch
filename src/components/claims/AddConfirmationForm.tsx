'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type { ClaimView } from '@/lib/claims';
import { updateClaim } from './claim-api';
import { ClaimError, type ClaimErrorState } from './ClaimError';
import { ConfirmationNumberField, checkConfirmationNumber } from './ConfirmationNumberField';

/**
 * Adds (or corrects) the administrator's confirmation number. With a number,
 * a reported claim becomes "Submitted · #number".
 */
export function AddConfirmationForm({
  claimId,
  initialValue = '',
  submitLabel = 'Add number',
  autoFocus = false,
  onSaved,
  onCancel,
}: {
  claimId: string;
  initialValue?: string;
  submitLabel?: string;
  /** Move keyboard focus to the field when the form appears (after "I already filed"). */
  autoFocus?: boolean;
  onSaved: (claim: ClaimView, message: string) => void;
  onCancel?: () => void;
}) {
  const posthog = usePostHog();
  const id = useId();
  useEffect(() => {
    if (autoFocus) document.getElementById(`${id}-confirmation`)?.focus();
  }, [autoFocus, id]);
  const [value, setValue] = useState(initialValue);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<ClaimErrorState | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = checkConfirmationNumber(value, true);
    if (!check.ok) {
      setFieldError(check.error);
      document.getElementById(`${id}-confirmation`)?.focus();
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
      setError({ message: result.error, status: result.status });
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
      <ClaimError error={error} />
    </form>
  );
}
