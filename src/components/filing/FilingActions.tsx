'use client';

import { useState } from 'react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import {
  addConfirmationNumber,
  moveToSelfFile,
  reopenFiling,
  withdrawClaim,
  type FilingResult,
  type WithdrawReason,
} from './filing-api';
import { FieldError, FormMessage } from './ui';

const COPY = ONE_CLICK_COPY.actions;
type Pending = 'self_file' | 'reopen' | 'withdraw' | null;

/**
 * What the member can still do with a one-click claim, each behind a short
 * confirmation: finish on the official site instead, make a change (cancels
 * the signature), withdraw, or add the administrator's confirmation number.
 * Shown only when the server's actions allow it.
 */
export function FilingActions({
  view,
  busy,
  onView,
}: {
  view: ClaimFilingView;
  busy: boolean;
  onView: (view: ClaimFilingView, message: string) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<WithdrawReason>('changed_mind');
  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const { actions } = view;
  const off = busy || working;

  async function run(result: Promise<FilingResult<ClaimFilingView>>, message: string) {
    setWorking(true);
    setError(null);
    const r = await result;
    setWorking(false);
    if (!r.ok) return setError(r.error.error);
    setPending(null);
    onView(r.data, message);
  }

  async function saveNumber(e: React.FormEvent) {
    e.preventDefault();
    setNumberError(null);
    const value = number.trim();
    if (!value) {
      setNumberError(COPY.confirmationEmpty);
      document.getElementById('filing-confirmation-number')?.focus();
      return;
    }
    setWorking(true);
    const r = await addConfirmationNumber(view.claim.id, value);
    setWorking(false);
    if (!r.ok) {
      setNumberError(r.error.fields?.[0]?.message ?? r.error.error);
      document.getElementById('filing-confirmation-number')?.focus();
      return;
    }
    setNumber('');
    onView(r.data, COPY.confirmationDone);
  }

  const confirmBox = (text: string, yes: string, act: () => void, extra?: React.ReactNode) => (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm leading-relaxed text-ink">{text}</p>
      {extra}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary !py-2 text-sm" onClick={act} disabled={off}>
          {working ? COPY.working : yes}
        </button>
        <button type="button" className="btn-secondary !py-2 text-sm" onClick={() => setPending(null)} disabled={working}>
          {COPY.keep}
        </button>
      </div>
    </div>
  );

  const any = actions.can_self_file || actions.can_reopen || actions.can_withdraw || actions.can_add_confirmation;
  if (!any) return null;

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      {actions.can_add_confirmation && (
        <form onSubmit={saveNumber} noValidate className="mb-4">
          <h3 className="text-sm font-bold">{COPY.confirmationTitle}</h3>
          <label htmlFor="filing-confirmation-number" className="field-label mt-2">
            {COPY.confirmationLabel}
          </label>
          <p id="filing-confirmation-help" className="mb-1.5 text-sm text-ink-muted">
            {COPY.confirmationHelp}
          </p>
          <input
            id="filing-confirmation-number"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
            className="field-input sm:max-w-md"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-describedby={numberError ? 'filing-confirmation-help filing-confirmation-error' : 'filing-confirmation-help'}
            aria-invalid={numberError ? true : undefined}
          />
          <FieldError id="filing-confirmation-error" message={numberError} />
          <button type="submit" className="btn-secondary mt-3" disabled={off}>
            {COPY.confirmationSave}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.can_reopen && (
          <button type="button" className="btn-secondary !py-2 text-sm" onClick={() => setPending('reopen')} disabled={off}>
            {COPY.reopen}
          </button>
        )}
        {actions.can_self_file && (
          <button type="button" className="btn-secondary !py-2 text-sm" onClick={() => setPending('self_file')} disabled={off}>
            {COPY.selfFile}
          </button>
        )}
        {actions.can_withdraw && (
          <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setPending('withdraw')} disabled={off}>
            {COPY.withdraw}
          </button>
        )}
      </div>

      {pending === 'reopen' &&
        confirmBox(COPY.reopenConfirm, COPY.reopenYes, () => run(reopenFiling(view.claim.id), COPY.reopenDone))}
      {pending === 'self_file' &&
        confirmBox(COPY.selfFileConfirm, COPY.selfFileYes, () => run(moveToSelfFile(view.claim.id), COPY.selfFileDone))}
      {pending === 'withdraw' &&
        confirmBox(
          COPY.withdrawConfirm,
          COPY.withdrawYes,
          () => run(withdrawClaim(view.claim.id, reason), COPY.withdrawDone),
          <fieldset className="mt-3">
            <legend className="field-label">{COPY.withdrawReason}</legend>
            {(Object.keys(COPY.withdrawReasons) as WithdrawReason[]).map((value) => (
              <label key={value} className="flex min-h-tap cursor-pointer items-center gap-3 text-sm text-ink">
                <input
                  type="radio"
                  name="filing-withdraw-reason"
                  value={value}
                  className="h-5 w-5 border-gray-300 text-brand-600 focus:ring-brand-400"
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                {COPY.withdrawReasons[value]}
              </label>
            ))}
          </fieldset>,
        )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
