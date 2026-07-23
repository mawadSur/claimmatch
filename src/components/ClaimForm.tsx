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
  Info,
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
 * Guided claim form built around ClaimMatch's pre-fill + deep-link model. It
 * pre-fills name / email / state / zip from the profile, collects a short
 * confirmation (typed legal name + checkbox), POSTs to /api/claims to SAVE the
 * pre-filled answers, then hands the user off to the OFFICIAL administrator site
 * to review and submit the claim themselves. ClaimMatch never files for the user
 * and never takes a cut of any recovery.
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
  // Local acknowledgement that the user submitted on the official site. This is
  // their own confirmation for our tracker — we can't observe the administrator.
  const [markedSubmitted, setMarkedSubmitted] = useState(false);

  // Where the user actually files: the official administrator claim form.
  const officialUrl = lawsuit.claim_url ?? lawsuit.source_url ?? null;

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

  // Success panel: details saved, now file on the official site ------------
  if (phase === 'success' && result) {
    return (
      <div className="rounded-2xl border-t-4 border-brand-500 bg-white p-6 shadow-card sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold">Your details are saved</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            We&rsquo;ve saved your pre-filled answers for{' '}
            <span className="font-semibold text-ink">{lawsuit.title}</span>. One
            step left: open the official claim form and submit it there. Claims
            can only be filed on the administrator&rsquo;s own site — so you
            review everything and submit it yourself.
          </p>

          {/* The deep-link: open the official claim form ------------------- */}
          {officialUrl ? (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-6 w-full max-w-sm justify-center"
            >
              <ExternalLink className="h-4 w-4" /> Open the official claim form
            </a>
          ) : (
            <div className="mt-6 flex w-full max-w-sm items-start gap-2 rounded-xl bg-gray-50 p-4 text-left text-xs text-ink-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
              <span>
                We don&rsquo;t have the administrator&rsquo;s claim link for this
                settlement yet. Check the settlement page for the official source,
                or come back once the link is posted.
              </span>
            </div>
          )}

          {/* Our internal tracking reference (NOT a filed claim number) ---- */}
          <div className="mt-6 w-full max-w-sm rounded-xl bg-gray-50 p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">
              Your ClaimMatch tracking reference
            </div>
            <div className="mt-1 text-3xl font-extrabold text-brand-700">
              #{result.receipt_number}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="badge-brand">
                {CLAIM_STATUS_LABELS[result.status] ?? result.status}
              </span>
              {result.estimated_value != null && (
                <span className="badge-green">
                  Est. {formatUSD(result.estimated_value)}
                </span>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
              This is our internal reference for tracking your claim in your
              dashboard. It is not a government or court claim number — the
              administrator issues that when you submit on their site.
            </p>
          </div>

          {/* Confirm they submitted on the official site ------------------ */}
          <div className="mt-6 w-full max-w-sm">
            {markedSubmitted ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-semibold text-success-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Marked as submitted — we&rsquo;ll keep tracking it for you.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMarkedSubmitted(true)}
                className="btn-secondary w-full justify-center"
              >
                <CheckCircle2 className="h-4 w-4" /> I&rsquo;ve submitted it on the
                official site
              </button>
            )}
          </div>

          <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/dashboard" className="btn-ghost justify-center">
              <LayoutDashboard className="h-4 w-4" /> Go to your dashboard
            </Link>
          </div>

          <p className="mt-6 max-w-md text-xs leading-relaxed text-ink-soft">
            We&rsquo;ll keep this claim in your tracker so you can follow it to
            payout. ClaimMatch is free — any settlement money is paid directly to
            you by the administrator, and we never take a cut. {SHORT_DISCLAIMER}
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
        We&rsquo;ve pre-filled what we know so filing is quick. Review everything
        — you&rsquo;ll use these exact details to submit on the official
        administrator&rsquo;s site.
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
            account record). Note what you have — you&rsquo;ll upload it on the
            official site when you submit.
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

      {/* Confirm & save -------------------------------------------------- */}
      <div className="mt-8 rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-brand-600" />
          <h3 className="text-base font-bold">Confirm &amp; save your details</h3>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50/70 p-3 text-xs text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>
            ClaimMatch is free and never takes a cut of your recovery. We save
            these answers and hand you off to the official site — you review and
            submit the claim yourself.
          </span>
        </div>

        <label className="field-label mt-4">Matching &amp; pre-fill terms</label>
        <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-muted">
          {SERVICES_AGREEMENT}
        </div>

        <div className="mt-4">
          <label className="field-label" htmlFor="claim-signature">
            Type your full legal name to confirm
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
            I confirm these details are accurate and understand I&rsquo;ll submit
            this claim myself on the official settlement site.
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
            to save your claim details.
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
            <Loader2 className="h-4 w-4 animate-spin" /> Saving your details…
          </>
        ) : (
          <>
            Save &amp; continue to official form <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        {SHORT_DISCLAIMER} ClaimMatch pre-fills your claim and links you to the
        official administrator&rsquo;s site, where you review and submit it
        yourself. It&rsquo;s free, and we never take a cut of your recovery.
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
