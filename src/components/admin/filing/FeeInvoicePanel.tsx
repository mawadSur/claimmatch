'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { CLAIMMATCH_FEE_RATE } from '@/lib/copy';
import { STAFF_API_BASE, type ApiError } from './api';
import { ErrorNote, Panel } from './ui';

/**
 * Admin-only: record a confirmed payout and send a recovery-only Stripe invoice.
 * Hidden for non-admins by the parent. The API checks isAdmin again.
 */
export function FeeInvoicePanel() {
  const [claimId, setClaimId] = useState('');
  const [payoutDollars, setPayoutDollars] = useState('');
  const [daysUntilDue, setDaysUntilDue] = useState<'14' | '30'>('14');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const dollars = Number(payoutDollars);
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    try {
      const res = await fetch(`${STAFF_API_BASE}/fee-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId.trim(),
          payout_amount_cents: cents,
          days_until_due: Number(daysUntilDue),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        invoice?: { stripe_hosted_invoice_url?: string | null; fee_amount_cents?: number };
      };
      if (!res.ok) {
        setError({
          status: res.status,
          code: (json.code as ApiError['code']) ?? 'network_error',
          message: json.error ?? 'Could not send the invoice.',
          fields: [],
          retryAfter: null,
        });
        return;
      }
      const fee = json.invoice?.fee_amount_cents;
      const url = json.invoice?.stripe_hosted_invoice_url;
      setOk(
        url
          ? `Invoice sent (${fee != null ? `$${(fee / 100).toFixed(2)}` : 'fee recorded'}). Hosted link: ${url}`
          : 'Invoice sent.',
      );
      setClaimId('');
      setPayoutDollars('');
    } catch {
      setError({
        status: 0,
        code: 'network_error',
        message: 'Could not reach Lawsuit AI. Check your connection and try again.',
        fields: [],
        retryAfter: null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Recovery fee invoice"
      description={`Record a confirmed payout and email the member a Stripe invoice for ${CLAIMMATCH_FEE_RATE} percent. Lawsuit AI never holds settlement funds. Net-14 or net-30.`}
    >
      <form onSubmit={(e) => void submit(e)} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm">
          <span className="font-semibold text-ink">Claim id</span>
          <input
            className="field-input mt-1"
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            placeholder="uuid"
            required
            autoComplete="off"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-ink">Confirmed payout (USD)</span>
          <input
            className="field-input mt-1"
            type="number"
            min="0.01"
            step="0.01"
            value={payoutDollars}
            onChange={(e) => setPayoutDollars(e.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-ink">Due</span>
          <select
            className="field-input mt-1"
            value={daysUntilDue}
            onChange={(e) => setDaysUntilDue(e.target.value === '30' ? '30' : '14')}
          >
            <option value="14">Net 14</option>
            <option value="30">Net 30</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={busy}>
            <Receipt className="h-4 w-4" aria-hidden />
            {busy ? 'Sending…' : `Send ${CLAIMMATCH_FEE_RATE} percent invoice`}
          </button>
        </div>
      </form>
      <ErrorNote error={error} />
      {ok ? <p className="mt-3 text-sm text-ink">{ok}</p> : null}
    </Panel>
  );
}
