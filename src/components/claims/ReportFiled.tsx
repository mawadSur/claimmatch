'use client';

import { useEffect, useId, useState } from 'react';
import { BadgeCheck, CheckCircle2, Loader2, Pencil, Undo2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  FILED_ON_EARLIEST,
  claimActionAvailability,
  displayClaimStatus,
  validateFiledOn,
  type ClaimView,
  type SettlementContext,
} from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';
import { localISODate, startTracking, updateClaim } from './claim-api';
import { AddConfirmationForm } from './AddConfirmationForm';
import { ConfirmationNumberField, checkConfirmationNumber } from './ConfirmationNumberField';

type OnChange = (claim: ClaimView, message: string) => void;

/**
 * Step 3: "Tell us when you've filed". Shows the report form, or the reported
 * or submitted state with "add the number later", "undo" and "correct".
 */
export function ReportFiled({
  lawsuitId,
  claim,
  context,
  allowSave,
  onChange,
}: {
  lawsuitId: string;
  claim: ClaimView | null;
  context: SettlementContext;
  /** Offer "Save to my claims" (before tracking starts, while the settlement is open). */
  allowSave: boolean;
  onChange: OnChange;
}) {
  if (claim?.status === 'reported_filed') return <ReportedCard claim={claim} onChange={onChange} />;
  const display = claim ? displayClaimStatus(claim, context) : null;
  if (claim && display?.kind === 'submitted') {
    return <SubmittedCard claim={claim} label={display.label} onChange={onChange} />;
  }
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : context.openForClaims;
  if (!canReport) {
    return (
      <p className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-ink-muted">
        {claim?.status === 'withdrawn'
          ? 'You stopped tracking this claim.'
          : 'It has been more than 30 days since the deadline, so this claim can no longer be updated here. If you filed, keep the confirmation the settlement administrator sent you.'}
      </p>
    );
  }
  return <ReportForm lawsuitId={lawsuitId} claim={claim} allowSave={allowSave && !claim} onChange={onChange} />;
}

function ReportForm({
  lawsuitId,
  claim,
  allowSave,
  onChange,
}: {
  lawsuitId: string;
  claim: ClaimView | null;
  allowSave: boolean;
  onChange: OnChange;
}) {
  const posthog = usePostHog();
  const id = useId();
  const [number, setNumber] = useState('');
  const [filedOn, setFiledOn] = useState('');
  const [today, setToday] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'report' | 'save'>(null);

  // The user's own "today", set after mount so server and client markup match.
  useEffect(() => {
    const t = localISODate();
    setToday(t);
    setFiledOn((v) => v || t);
  }, []);

  async function ensureClaim(): Promise<ClaimView | null> {
    if (claim) return claim;
    const started = await startTracking(lawsuitId);
    if (!started.ok) {
      setError(started.error);
      return null;
    }
    posthog?.capture('claim_tracking_started');
    onChange(started.claim, '');
    return started.claim;
  }

  async function report(e: React.FormEvent) {
    e.preventDefault();
    const numberCheck = checkConfirmationNumber(number, false);
    const dateCheck = filedOn ? validateFiledOn(filedOn, new Date()) : null;
    setNumberError(numberCheck.ok ? null : numberCheck.error);
    setDateError(dateCheck && !dateCheck.ok ? dateCheck.message : null);
    if (!numberCheck.ok || (dateCheck && !dateCheck.ok)) return;

    setError(null);
    setBusy('report');
    const current = await ensureClaim();
    if (!current) {
      setBusy(null);
      return;
    }
    const result = await updateClaim(current.id, {
      action: 'report_filed',
      ...(numberCheck.value ? { confirmation_number: numberCheck.value } : {}),
      ...(dateCheck?.ok ? { filed_on: dateCheck.value } : {}),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    posthog?.capture('claim_reported_filed', { with_confirmation_number: Boolean(numberCheck.value) });
    onChange(
      result.claim,
      numberCheck.value
        ? 'Saved. Your claim shows as submitted with your confirmation number.'
        : 'Saved. Your claim shows as Reported filed by you. Add the confirmation number when you get it.',
    );
  }

  async function save() {
    setError(null);
    setBusy('save');
    const started = await startTracking(lawsuitId);
    setBusy(null);
    if (!started.ok) {
      setError(started.error);
      return;
    }
    posthog?.capture('claim_tracking_started');
    onChange(started.claim, 'Saved to your claims as Not filed yet. You can find it, with its deadline, on your dashboard.');
  }

  return (
    <form onSubmit={report} noValidate className="space-y-4">
      <ConfirmationNumberField id={`${id}-number`} value={number} onChange={setNumber} error={numberError} />
      <div>
        <label htmlFor={`${id}-date`} className="field-label">
          Date you filed <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id={`${id}-date`}
          type="date"
          className="field-input sm:max-w-xs"
          min={FILED_ON_EARLIEST}
          max={today || undefined}
          value={filedOn}
          onChange={(e) => setFiledOn(e.target.value)}
          aria-describedby={dateError ? `${id}-date-error` : undefined}
          aria-invalid={dateError ? true : undefined}
        />
        {dateError && (
          <p id={`${id}-date-error`} className="mt-1.5 text-sm font-medium text-danger-700">
            {dateError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === 'report' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            'I filed my claim'
          )}
        </button>
        {allowSave && (
          <button type="button" className="btn-secondary" onClick={save} disabled={busy !== null}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Not yet: save to my claims
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        No confirmation number yet? That&rsquo;s fine. Tell us now and add it later.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </form>
  );
}

function ReportedCard({ claim, onChange }: { claim: ClaimView; onChange: OnChange }) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    const result = await updateClaim(claim.id, { action: 'undo_report' });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    posthog?.capture('claim_report_undone');
    onChange(result.claim, 'Undone. Your claim shows as Not filed yet again.');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
        <div>
          <p className="font-semibold text-ink">
            Reported filed by you
            {claim.user_filed_on ? ` on ${formatDeadline(claim.user_filed_on)}` : ''}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Next, add your confirmation number when you get it. Look for an email
            from the settlement administrator.
          </p>
        </div>
      </div>
      <AddConfirmationForm claimId={claim.id} onSaved={onChange} />
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm text-ink-muted">Told us by mistake?</p>
        <button type="button" className="btn-ghost -ml-3 mt-1" onClick={undo} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
          Undo: I haven&rsquo;t filed yet
        </button>
        {error && (
          <p role="alert" className="mt-1 text-sm font-medium text-danger-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SubmittedCard({ claim, label, onChange }: { claim: ClaimView; label: string; onChange: OnChange }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-success-50 p-4">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-700" aria-hidden />
        <div>
          <p className="font-semibold text-ink">{label}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Keep this number. The settlement administrator reviews claims and sends
            any payment. Watch for their emails and check the official site for
            updates.
            {claim.user_filed_on ? ` You filed on ${formatDeadline(claim.user_filed_on)}.` : ''}
          </p>
        </div>
      </div>
      {editing ? (
        <AddConfirmationForm
          claimId={claim.id}
          initialValue={claim.confirmation_number ?? ''}
          submitLabel="Save number"
          onSaved={(next) => {
            setEditing(false);
            onChange(next, 'Saved. Your confirmation number was updated.');
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button type="button" className="btn-ghost -ml-3" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden /> Correct the number
        </button>
      )}
    </div>
  );
}
