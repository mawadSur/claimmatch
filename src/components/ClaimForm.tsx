'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  LayoutDashboard,
  LogIn,
  AlertCircle,
  FileSignature,
  ShieldCheck,
} from 'lucide-react';
import { US_STATES } from '@/lib/utils';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { CLAIM_STATUS_LABELS } from '@/lib/types';
import type { Lawsuit, Profile, ClaimStatus } from '@/lib/types';
import { formatUSD } from '@/lib/recovery';
import { SERVICES_AGREEMENT, ATTESTATION } from '@/lib/services-agreement';

type Result = {
  id: string;
  receipt_number: number;
  status: ClaimStatus;
  estimated_value: number | null;
};
type Phase = 'idle' | 'loading' | 'success' | 'error' | 'unauth' | 'notfound';

/**
 * Guided claim form. Pre-fills name / email / state / zip from the profile,
 * collects the e-sign authorization (typed legal name + checkbox against the
 * services agreement), POSTs to /api/claims, then shows a receipt panel.
 */
export function ClaimForm({
  lawsuit,
  profile,
}: {
  lawsuit: Lawsuit;
  profile: Profile | null;
}) {
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    email: profile?.email ?? '',
    address: '',
    city: '',
    state: profile?.state ?? '',
    zip: profile?.zip ?? '',
    proof_note: '',
  });
  const [signatureName, setSignatureName] = useState(profile?.full_name ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSubmit =
    confirmed && signatureName.trim().length >= 2 && phase !== 'loading';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('loading');
    setError('');
    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawsuit_id: lawsuit.id,
          signature_name: signatureName.trim(),
          form_data: { ...form, confirmed_eligibility: true },
        }),
      });

      if (res.status === 401) {
        setPhase('unauth');
        return;
      }

      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setResult(json as Result);
        setPhase('success');
      } else if (res.status === 404) {
        setError(
          json?.error || 'That settlement could not be found. It may have closed.',
        );
        setPhase('notfound');
      } else {
        setError(json?.error || 'Something went wrong. Please try again.');
        setPhase('error');
      }
    } catch {
      setError('Network error — please try again.');
      setPhase('error');
    }
  }

  // Success receipt panel --------------------------------------------------
  if (phase === 'success' && result) {
    return (
      <div className="rounded-2xl border-t-4 border-success-500 bg-white p-6 shadow-card sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold">Claim filed</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            We’ve filed your claim for{' '}
            <span className="font-semibold text-ink">{lawsuit.title}</span> on
            your behalf. Keep your receipt number for your records.
          </p>

          <div className="mt-6 w-full max-w-sm rounded-xl bg-gray-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">
              Your receipt number is
            </div>
            <div className="mt-1 text-3xl font-extrabold text-brand-700">
              #{result.receipt_number}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="badge-green">
                {CLAIM_STATUS_LABELS[result.status] ?? result.status}
              </span>
              {result.estimated_value != null && (
                <span className="badge-brand">
                  Est. {formatUSD(result.estimated_value)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/dashboard" className="btn-primary justify-center">
              <LayoutDashboard className="h-4 w-4" /> Go to your dashboard
            </Link>
            {lawsuit.claim_url && (
              <a
                href={lawsuit.claim_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary justify-center"
              >
                <ExternalLink className="h-4 w-4" /> View official claim site
              </a>
            )}
          </div>

          <p className="mt-6 max-w-md text-xs leading-relaxed text-ink-soft">
            We’ll keep you posted on your claim’s status. If it pays out, we’ll
            deduct our published fee and forward you the rest. {SHORT_DISCLAIMER}
          </p>
        </div>
      </div>
    );
  }

  // Form -------------------------------------------------------------------
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8"
    >
      <h2 className="text-lg font-bold">Your claim details</h2>
      <p className="mt-1 text-sm text-ink-muted">
        We’ve pre-filled what we know. Review everything — the settlement
        administrator uses these details to verify your claim.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <input
            type="text"
            required
            autoComplete="name"
            className="field-input"
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
          />
        </Field>

        <Field label="Email" className="sm:col-span-2">
          <input
            type="email"
            required
            autoComplete="email"
            className="field-input"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </Field>

        <Field label="Mailing address" className="sm:col-span-2">
          <input
            type="text"
            autoComplete="street-address"
            placeholder="Street address"
            className="field-input"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
          />
        </Field>

        <Field label="City">
          <input
            type="text"
            autoComplete="address-level2"
            className="field-input"
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="State">
            <select
              className="field-input"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ZIP">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              className="field-input"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
            />
          </Field>
        </div>
      </div>

      {lawsuit.proof_required && (
        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <label className="field-label">Proof of eligibility</label>
          <p className="mb-2 text-xs text-ink-soft">
            This settlement requires documentation (e.g. a receipt, notice, or
            account record). Describe what you have — you’ll upload it on the
            official site.
          </p>
          <textarea
            rows={3}
            className="field-input"
            placeholder="e.g. I have the breach notification letter dated…"
            value={form.proof_note}
            onChange={(e) => update('proof_note', e.target.value)}
          />
        </div>
      )}

      {/* E-sign authorization -------------------------------------------- */}
      <div className="mt-8 rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-brand-600" />
          <h3 className="text-base font-bold">Authorize ClaimMatch to file</h3>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50/70 p-3 text-xs text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>
            It costs nothing to file. ClaimMatch only earns its published fee as
            a percentage of money you actually recover.
          </span>
        </div>

        <label className="field-label mt-4">Services agreement</label>
        <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-muted">
          {SERVICES_AGREEMENT}
        </div>

        <div className="mt-4">
          <label className="field-label" htmlFor="claim-signature">
            Type your full legal name to sign
          </label>
          <input
            id="claim-signature"
            type="text"
            required
            autoComplete="name"
            className="field-input"
            placeholder="e.g. Jordan A. Smith"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            {ATTESTATION}
          </p>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-xl bg-gray-50 p-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span className="text-sm text-ink-muted">
            I authorize ClaimMatch to file this claim on my behalf and attest the
            information above is accurate.
          </span>
        </label>
      </div>

      {phase === 'unauth' && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-danger-50 p-4 text-sm text-danger-700">
          <LogIn className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your session expired.{' '}
            <Link
              href={`/login?next=/claim/${lawsuit.slug}`}
              className="font-semibold underline"
            >
              Log in again
            </Link>{' '}
            to file this claim.
          </span>
        </div>
      )}

      {(phase === 'error' || phase === 'notfound') && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-danger-50 p-4 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary mt-6 w-full justify-center"
      >
        {phase === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Filing your claim…
          </>
        ) : (
          <>
            Sign &amp; file my claim <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        {SHORT_DISCLAIMER} By signing you authorize ClaimMatch to submit this
        claim on your behalf; our fee applies only to money you recover.
      </p>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
