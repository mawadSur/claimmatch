'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, AlertCircle, ExternalLink } from 'lucide-react';
import type { Partner, PartnerCategory, PayoutModel } from '@/lib/types';
import { PARTNER_CATEGORY_LABELS } from '@/lib/types';

/** Per-partner performance, keyed by partner id. */
export type PartnerStats = Record<
  string,
  { clicks: number; conversions: number; revenueCents: number }
>;

const EMPTY_STATS = { clicks: 0, conversions: 0, revenueCents: 0 };

const PAYOUT_LABEL: Record<PayoutModel, string> = {
  per_lead: 'Per lead',
  per_conversion: 'Per conversion',
  hybrid: 'Hybrid',
};

const CATEGORIES = Object.keys(PARTNER_CATEGORY_LABELS) as PartnerCategory[];
const PAYOUTS: PayoutModel[] = ['per_lead', 'per_conversion', 'hybrid'];

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Admin partner catalog. Lists every partner with its payout terms and live
 * performance, lets an admin toggle a partner on/off, and adds new partners.
 * Mutations hit /api/admin/partners and refresh the server data on success.
 */
export function PartnerAdminTable({
  partners,
  stats,
}: {
  partners: Partner[];
  stats: PartnerStats;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function toggleActive(p: Partner) {
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, active: !p.active }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || 'Could not update the partner.');
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="btn-secondary"
        >
          <Plus className="h-4 w-4" /> {adding ? 'Cancel' : 'Add partner'}
        </button>
      </div>

      {adding && (
        <AddPartnerForm
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-card">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="p-4 font-semibold">Partner</th>
              <th className="p-4 font-semibold">Payout</th>
              <th className="p-4 font-semibold tabular-nums">Fees</th>
              <th className="p-4 font-semibold tabular-nums">Performance</th>
              <th className="p-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {partners.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-ink-soft">
                  No partners yet. Add one to start earning referral fees.
                </td>
              </tr>
            )}
            {partners.map((p) => {
              const s = stats[p.id] ?? EMPTY_STATS;
              return (
                <tr key={p.id} className="align-top">
                  <td className="p-4">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="text-xs text-ink-soft">
                      {PARTNER_CATEGORY_LABELS[p.category]} · /{p.slug}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                    >
                      Destination <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="p-4 text-ink-muted">{PAYOUT_LABEL[p.payout_model]}</td>
                  <td className="p-4 tabular-nums text-ink-muted">
                    <div>{usd(p.lead_fee_cents)} / lead</div>
                    <div>{usd(p.conversion_fee_cents)} / conv.</div>
                  </td>
                  <td className="p-4 tabular-nums text-ink-muted">
                    <div>{s.clicks.toLocaleString()} clicks</div>
                    <div>{s.conversions.toLocaleString()} conv.</div>
                    <div className="font-semibold text-ink">{usd(s.revenueCents)}</div>
                  </td>
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      disabled={busyId === p.id}
                      className={
                        p.active
                          ? 'badge-green cursor-pointer'
                          : 'badge-gray cursor-pointer'
                      }
                      aria-label={p.active ? 'Deactivate partner' : 'Activate partner'}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : p.active ? (
                        'Active'
                      ) : (
                        'Off'
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddPartnerForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const fd = new FormData(e.currentTarget);
    const dollarsToCents = (v: FormDataEntryValue | null) =>
      Math.round(Number(v || 0) * 100);

    const payload = {
      name: String(fd.get('name') || '').trim(),
      slug: String(fd.get('slug') || '').trim(),
      url: String(fd.get('url') || '').trim(),
      category: String(fd.get('category') || 'general'),
      payout_model: String(fd.get('payout_model') || 'per_lead'),
      lead_fee_cents: dollarsToCents(fd.get('lead_fee')),
      conversion_fee_cents: dollarsToCents(fd.get('conversion_fee')),
      tagline: String(fd.get('tagline') || '').trim() || undefined,
      priority: Number(fd.get('priority') || 0),
    };

    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        onError(json?.error || 'Could not create the partner.');
      } else {
        onDone();
      }
    } catch {
      onError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:grid-cols-2"
    >
      <label className="block">
        <span className="field-label">Name</span>
        <input name="name" required className="field-input" placeholder="ClaimPros" />
      </label>
      <label className="block">
        <span className="field-label">Slug</span>
        <input name="slug" required className="field-input" placeholder="claimpros" />
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">Destination URL</span>
        <input name="url" type="url" required className="field-input" placeholder="https://partner.example.com/offer" />
      </label>
      <label className="block">
        <span className="field-label">Category</span>
        <select name="category" className="field-input" defaultValue="general">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PARTNER_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Payout model</span>
        <select name="payout_model" className="field-input" defaultValue="per_lead">
          {PAYOUTS.map((m) => (
            <option key={m} value={m}>
              {PAYOUT_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">Lead fee ($ per click)</span>
        <input name="lead_fee" type="number" min="0" step="0.01" className="field-input" placeholder="3.00" />
      </label>
      <label className="block">
        <span className="field-label">Conversion fee ($ per CPA)</span>
        <input name="conversion_fee" type="number" min="0" step="0.01" className="field-input" placeholder="40.00" />
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">Tagline</span>
        <input name="tagline" className="field-input" placeholder="Full-service help for complex claims" />
      </label>
      <label className="block">
        <span className="field-label">Priority</span>
        <input name="priority" type="number" min="0" step="1" defaultValue="0" className="field-input" />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create partner
        </button>
      </div>
    </form>
  );
}
