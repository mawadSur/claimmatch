'use client';

import { useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { posthogMatchEventName } from '@/lib/match-events';

/**
 * "I got paid" — amount only. No fee is shown or charged.
 */
export function ReportPayout({
  claimId,
  lawsuitId,
  enabled,
}: {
  claimId: string;
  lawsuitId: string;
  enabled: boolean;
}) {
  const posthog = usePostHog();
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  if (!enabled) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      posthog?.capture(posthogMatchEventName('user_reported_payout'), { lawsuit_id: lawsuitId });
      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          lawsuit_id: lawsuitId,
          amount: amount === '' ? null : Number(amount),
          paid_on: paidOn || null,
          method: method || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || 'Could not save that just now.');
        setStatus('error');
        return;
      }
      setStatus('saved');
    } catch {
      setStatus('error');
      setError('Could not save that just now.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <h3 className="text-sm font-bold text-ink">I got paid</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Optional. We record the amount the administrator sent you. ClaimMatch
        does not charge a fee on this.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink">
          Amount (USD)
          <input
            type="number"
            min={0}
            max={100000}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-ink">
          Date
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-ink">
          How you were paid
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Choose…</option>
            <option value="check">Check</option>
            <option value="card">Card</option>
            <option value="e_payment">E-payment</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <button type="submit" className="btn-secondary mt-3 text-sm" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Save payout'}
      </button>
      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        {status === 'saved' && 'Thanks. We recorded the amount only.'}
        {status === 'error' && error}
      </p>
    </form>
  );
}
