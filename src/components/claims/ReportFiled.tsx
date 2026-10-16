'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, CheckCircle2, Loader2, Pencil, Undo2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  FILED_ON_EARLIEST,
  claimActionAvailability,
  displayClaimStatus,
  isKnownClaimStatus,
  reportByDay,
  validateFiledOn,
  type ClaimView,
  type SettlementContext,
} from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';
import { localISODate, startTracking, updateClaim } from './claim-api';
import { AddConfirmationForm } from './AddConfirmationForm';
import { ClaimError, type ClaimErrorState } from './ClaimError';
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
  defaultFiledToday = true,
  onChange,
}: {
  lawsuitId: string;
  claim: ClaimView | null;
  context: SettlementContext;
  /** Offer "Save to my claims" (before tracking starts, while the settlement is open). */
  allowSave: boolean;
  /** Pre-fill today's date. Off for late reports, which are about an earlier day. */
  defaultFiledToday?: boolean;
  onChange: OnChange;
}) {
  if (claim?.status === 'reported_filed') return <ReportedCard claim={claim} context={context} onChange={onChange} />;
  const display = claim ? displayClaimStatus(claim, context) : null;
  if (claim && display?.kind === 'submitted') {
    return <SubmittedCard claim={claim} label={display.label} onChange={onChange} />;
  }
  const canReport = claim ? claimActionAvailability(claim, context).reportFiled : context.openForClaims;
  if (!canReport) {
    let text =
      'It has been more than 30 days since the deadline, so this claim can no longer be updated here. If you filed, keep the confirmation the settlement administrator sent you.';
    if (claim?.status === 'withdrawn') text = 'You stopped tracking this claim.';
    else if (claim && !isKnownClaimStatus(claim.status)) {
      text = "We can't update this claim here right now. Check the official site for its status.";
    }
    return <p className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-ink-muted">{text}</p>;
  }
  return (
    <ReportForm
      lawsuitId={lawsuitId}
      claim={claim}
      allowSave={allowSave && !claim}
      defaultFiledToday={defaultFiledToday}
      onChange={onChange}
    />
  );
}

function ReportForm({
  lawsuitId,
  claim,
  allowSave,
  defaultFiledToday,
  onChange,
}: {
  lawsuitId: string;
  claim: ClaimView | null;
  allowSave: boolean;
  defaultFiledToday: boolean;
  onChange: OnChange;
}) {
  const posthog = usePostHog();
  const id = useId();
  const [number, setNumber] = useState('');
  const [filedOn, setFiledOn] = useState('');
  const [today, setToday] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<ClaimErrorState | null>(null);
  const [busy, setBusy] = useState<null | 'report' | 'save'>(null);

  // The user's own "today", set after mount so server and client markup match.
  useEffect(() => {
    const t = localISODate();
    setToday(t);
    if (defaultFiledToday) setFiledOn((v) => v || t);
  }, [defaultFiledToday]);

  async function ensureClaim(): Promise<ClaimView | null> {
    if (claim) return claim;
    const started = await startTracking(lawsuitId);
    if (!started.ok) {
      setError({ message: started.error, status: started.status });
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
    if (!numberCheck.ok || (dateCheck && !dateCheck.ok)) {
      // Take keyboard and screen-reader users to the first field to fix.
      document.getElementById(numberCheck.ok ? `${id}-date` : `${id}-number`)?.focus();
      return;
    }

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
      setError({ message: result.error, status: result.status });
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
      setError({ message: started.error, status: started.status });
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
      <ClaimError error={error} />
    </form>
  );
}

function ReportedCard({
  claim,
  context,
  onChange,
}: {
  claim: ClaimView;
  context: SettlementContext;
  onChange: OnChange;
}) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ClaimErrorState | null>(null);
  const confirmRef = useRef<HTMLParagraphElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const canUndo = claimActionAvailability(claim, context).undoReport;
  // After the deadline a "not filed" claim can only be reported until this day.
  const lastDay = context.deadlinePassed ? reportByDay(claim, context.deadline) : null;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function undo() {
    setBusy(true);
    setError(null);
    const result = await updateClaim(claim.id, { action: 'undo_report' });
    setBusy(false);
    if (!result.ok) {
      setError({ message: result.error, status: result.status });
      return;
    }
    posthog?.capture('claim_report_undone');
    const label = displayClaimStatus(result.claim, context).label;
    onChange(
      result.claim,
      lastDay
        ? `Undone. Your claim shows as ${label}. You can tell us you filed until ${formatDeadline(lastDay)}.`
        : `Undone. Your claim shows as ${label}.`,
    );
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
      {canUndo && (
        <div className="border-t border-gray-100 pt-4">
          {confirming ? (
            <div>
              <p ref={confirmRef} tabIndex={-1} className="text-sm font-semibold text-ink focus:outline-none">
                Undo your report that you filed?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {lastDay
                  ? `Your claim will show as not filed. After ${formatDeadline(lastDay)} you won't be able to tell us you filed.`
                  : 'Your claim will show as not filed until you tell us again.'}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-secondary" onClick={undo} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Yes, undo it
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                    // Back to the button that opened this, for keyboard users.
                    requestAnimationFrame(() => undoRef.current?.focus());
                  }}
                  disabled={busy}
                >
                  Keep my report
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Told us by mistake?</p>
              <button ref={undoRef} type="button" className="btn-ghost -ml-3 mt-1" onClick={() => setConfirming(true)}>
                <Undo2 className="h-4 w-4" aria-hidden />
                Undo: I haven&rsquo;t filed yet
              </button>
            </>
          )}
          <ClaimError error={error} className="mt-1" />
        </div>
      )}
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
