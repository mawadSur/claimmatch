'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  Monitor,
} from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { US_STATES, formatDeadline, daysUntil, getValidClaimUrl } from '@/lib/utils';
import { proofLabel } from '@/lib/proof';
import type { Claim, Lawsuit, Profile } from '@/lib/types';

type PacketFields = {
  full_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
};

const FIELD_LABELS: Record<keyof PacketFields, string> = {
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
};

function latestFormData(claim: Claim | null): Partial<PacketFields> {
  const data = (claim?.form_data ?? {}) as Partial<PacketFields> & { address?: string };
  return {
    full_name: data.full_name ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
    address_line1: data.address_line1 ?? data.address ?? '',
    address_line2: data.address_line2 ?? '',
    city: data.city ?? '',
    state: data.state ?? '',
    zip: data.zip ?? '',
  };
}

function formatPacketBlock(fields: PacketFields): string {
  const address = [fields.address_line1, fields.address_line2].filter(Boolean).join('\n');
  const cityLine = [fields.city, fields.state, fields.zip].filter(Boolean).join(', ').replace(', ,', ',');
  return [
    `Full name: ${fields.full_name}`,
    `Email: ${fields.email}`,
    `Phone: ${fields.phone}`,
    'Address:',
    address,
    cityLine,
  ]
    .filter((line) => line.trim() !== '' && line !== 'Address:')
    .join('\n');
}

export function ClaimPacket({
  lawsuit,
  profile,
  initialClaim,
}: {
  lawsuit: Lawsuit;
  profile: Profile | null;
  initialClaim: Claim | null;
}) {
  const posthog = usePostHog();
  const prior = latestFormData(initialClaim);
  const [fields, setFields] = useState<PacketFields>({
    full_name: prior.full_name || profile?.full_name || '',
    email: prior.email || profile?.email || '',
    phone: prior.phone || profile?.phone || '',
    address_line1: prior.address_line1 || profile?.address_line1 || '',
    address_line2: prior.address_line2 || profile?.address_line2 || '',
    city: prior.city || profile?.city || '',
    state: prior.state || profile?.state || '',
    zip: prior.zip || profile?.zip || '',
  });
  const [eligible, setEligible] = useState(false);
  const [consent, setConsent] = useState(Boolean(profile?.prefill_consent_at));
  const [copied, setCopied] = useState<string | null>(null);
  const [claim, setClaim] = useState<Claim | null>(initialClaim);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [confirmNumber, setConfirmNumber] = useState(initialClaim?.confirmation_number ?? '');
  const [submittedOn, setSubmittedOn] = useState(
    initialClaim?.user_submitted_at ? initialClaim.user_submitted_at.slice(0, 10) : '',
  );
  const [reportState, setReportState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    posthog?.capture('prefill_opened', { lawsuit_id: lawsuit.id, slug: lawsuit.slug });
  }, [posthog, lawsuit.id, lawsuit.slug]);

  const officialUrl = getValidClaimUrl(lawsuit.claim_url);
  const days = daysUntil(lawsuit.deadline);
  const needsConsent = !profile?.prefill_consent_at && !consent;
  const hasAddress = Boolean(fields.address_line1 || fields.city || fields.zip);
  const reported = Boolean(claim?.user_submitted_at) || claim?.status === 'submitted';

  const extraItems = useMemo(() => {
    const items = [
      'Class Member ID / Notice ID from the notice email or postcard',
      lawsuit.proof_required || lawsuit.eligibility?.proof === 'yes'
        ? 'Proof documents (receipts, account statements, or what the official notice lists)'
        : lawsuit.eligibility?.proof === 'optional'
          ? 'Optional proof that may increase a payment — check the official notice'
          : 'Any account or purchase details the official form asks for',
    ];
    if (lawsuit.eligibility?.notes) items.push(lawsuit.eligibility.notes);
    return items;
  }, [lawsuit]);

  function update<K extends keyof PacketFields>(key: K, value: PacketFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      posthog?.capture('prefill_copied', { field: label, lawsuit_id: lawsuit.id, slug: lawsuit.slug });
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function copyAll() {
    await copyValue('all', formatPacketBlock(fields));
  }

  async function savePacket(): Promise<Claim | null> {
    if (hasAddress && needsConsent) {
      setSaveError('Check the box to save these details for future claims.');
      setSaveState('error');
      return null;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const profilePatch: Record<string, unknown> = {
        full_name: fields.full_name,
        phone: fields.phone,
        state: fields.state,
        zip: fields.zip,
      };
      if (hasAddress && (consent || profile?.prefill_consent_at)) {
        profilePatch.address_line1 = fields.address_line1;
        profilePatch.address_line2 = fields.address_line2;
        profilePatch.city = fields.city;
        if (!profile?.prefill_consent_at) {
          profilePatch.prefill_consent_at = new Date().toISOString();
        }
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePatch),
      });

      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawsuit_id: lawsuit.id, form_data: fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      const next = { ...(claim ?? {}), ...json } as Claim;
      setClaim(next);
      setSaveState('saved');
      return next;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
      setSaveState('error');
      return null;
    }
  }

  async function ensurePacketThenOpen() {
    if (!claim) {
      try {
        const res = await fetch('/api/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lawsuit_id: lawsuit.id, form_data: fields }),
        });
        const json = await res.json();
        if (res.ok) setClaim((prev) => ({ ...(prev ?? {}), ...json } as Claim));
      } catch {
        // Opening the official form should not fail if the packet save does.
      }
    }
    posthog?.capture('official_form_opened', { lawsuit_id: lawsuit.id, slug: lawsuit.slug });
  }

  async function reportSubmitted(e: React.FormEvent) {
    e.preventDefault();
    const packet = claim?.id ? claim : await savePacket();
    const id = packet?.id;
    if (!id) {
      setReportState('error');
      return;
    }
    setReportState('saving');
    try {
      const res = await fetch(`/api/claims/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation_number: confirmNumber,
          submitted_on: submittedOn || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setClaim((prev) => ({ ...(prev ?? {}), ...json } as Claim));
      posthog?.capture('user_reported_submitted', { lawsuit_id: lawsuit.id, slug: lawsuit.slug });
      setReportState('idle');
    } catch {
      setReportState('error');
    }
  }

  return (
    <div className="space-y-8">
      {!eligible && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You may not qualify. Only file if the official criteria apply to you.
          ClaimMatch never attests for you.
        </p>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold">Eligibility self-check</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {lawsuit.eligibility_text ||
            'Read the official notice. Tick the box only if this settlement describes you.'}
        </p>
        {lawsuit.eligibility?.notes && (
          <p className="mt-2 text-sm text-ink-muted">{lawsuit.eligibility.notes}</p>
        )}
        <p className="mt-2 text-xs text-ink-soft">Proof: {proofLabel(lawsuit)}</p>
        <label className="mt-4 flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
            checked={eligible}
            onChange={(e) => setEligible(e.target.checked)}
          />
          <span>This describes me</span>
        </label>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Your claim details</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pre-filled from your profile. Edit anything that’s wrong, then copy
              into the official form.
            </p>
          </div>
          <button type="button" className="btn-secondary !py-2 !px-3 text-xs" onClick={copyAll}>
            <Copy className="h-3.5 w-3.5" />
            {copied === 'all' ? 'Copied all' : 'Copy all'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(Object.keys(FIELD_LABELS) as (keyof PacketFields)[]).map((key) => (
            <label key={key} className={key === 'address_line1' || key === 'email' ? 'sm:col-span-2' : ''}>
              <span className="field-label">{FIELD_LABELS[key]}</span>
              <div className="flex gap-2">
                {key === 'state' ? (
                  <select
                    className="field-input"
                    value={fields.state}
                    onChange={(e) => update('state', e.target.value)}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="field-input"
                    type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                    value={fields[key]}
                    onChange={(e) => update(key, e.target.value)}
                    autoComplete={
                      key === 'full_name'
                        ? 'name'
                        : key === 'email'
                          ? 'email'
                          : key === 'phone'
                            ? 'tel'
                            : key === 'zip'
                              ? 'postal-code'
                              : 'street-address'
                    }
                  />
                )}
                <button
                  type="button"
                  className="btn-ghost !px-3"
                  onClick={() => copyValue(key, fields[key])}
                  aria-label={`Copy ${FIELD_LABELS[key]}`}
                >
                  {copied === key ? 'Copied' : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </label>
          ))}
        </div>

        {hasAddress && !profile?.prefill_consent_at && (
          <label className="mt-4 flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Save these details to pre-fill future claims</span>
          </label>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={savePacket} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save details
          </button>
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-success-600">
              <CheckCircle2 className="h-4 w-4" /> Saved to your profile
            </span>
          )}
          {saveState === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-danger-600">
              <AlertCircle className="h-4 w-4" /> {saveError}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
        <h2 className="text-lg font-bold">Items only you have</h2>
        <p className="mt-1 text-sm text-ink-muted">
          The official form may ask for things ClaimMatch cannot see.
        </p>
        <ul className="mt-4 space-y-2">
          {extraItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border-t-4 border-brand-400 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold">Open the official claim form</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Filing is free on the administrator’s site. ClaimMatch does not submit
          this for you.
        </p>
        {officialUrl ? (
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-5 w-full justify-center sm:w-auto"
            onClick={() => void ensurePacketThenOpen()}
          >
            Open the official claim form <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">
            We don’t have a working official claim link for this settlement yet.
            Use the settlement notice on the{' '}
            <Link href={`/lawsuits/${lawsuit.slug}`} className="font-semibold text-brand-700">
              settlement page
            </Link>
            .
          </p>
        )}
        <p className="mt-4 hidden items-center gap-2 text-xs text-ink-soft sm:flex">
          <Monitor className="h-3.5 w-3.5" />
          Tip: put the official form side-by-side with this packet and paste as you go.
        </p>
        <p className="mt-4 text-xs text-ink-soft sm:hidden">
          The official form opens in a new tab. Keep this packet one tab back and
          paste as you go.
        </p>
        {days !== null && days >= 0 && (
          <p className="mt-3 text-xs font-semibold text-danger-600">
            Deadline {formatDeadline(lawsuit.deadline)}
            {days <= 30 ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold">I submitted my claim</h2>
        {reported ? (
          <p className="mt-2 text-sm text-success-700">
            You submitted on{' '}
            {formatDeadline(claim?.user_submitted_at ?? new Date().toISOString())}
            {claim?.confirmation_number ? ` · confirmation ${claim.confirmation_number}` : ''}.
          </p>
        ) : (
          <form onSubmit={reportSubmitted} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="field-label">Administrator confirmation number</span>
              <input
                className="field-input"
                value={confirmNumber}
                onChange={(e) => setConfirmNumber(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              <span className="field-label">Date you submitted</span>
              <input
                className="field-input"
                type="date"
                value={submittedOn}
                onChange={(e) => setSubmittedOn(e.target.value)}
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-secondary" disabled={reportState === 'saving'}>
                {reportState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                I submitted my claim
              </button>
              {reportState === 'error' && (
                <p className="mt-2 text-sm text-danger-600">Could not save. Try saving your details first.</p>
              )}
            </div>
          </form>
        )}
      </section>

      <p className="text-xs leading-relaxed text-ink-soft">
        You are responsible for the accuracy of what you submit. Claims are signed
        and submitted by you under the administrator’s terms.{' '}
        <Link href="/how-we-make-money" className="font-semibold text-brand-700 hover:text-brand-800">
          How ClaimMatch makes money
        </Link>
        .
      </p>
    </div>
  );
}
