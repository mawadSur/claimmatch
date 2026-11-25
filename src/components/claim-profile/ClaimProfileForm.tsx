'use client';

import { useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  CLAIM_PROFILE_FIELDS,
  PAYOUT_PREFERENCE_LABELS,
  PAYOUT_PREFERENCES,
  currentAddressOf,
  type ClaimProfile,
  type ClaimProfileAddress,
  type PayoutPreference,
} from '@/lib/claim-profile';
import { COLLECT_ADMIN_PIN_NOTE } from '@/lib/claim-actions';
import { US_STATES } from '@/lib/utils';

function emptyAddress(kind: 'current' | 'prior'): ClaimProfileAddress {
  return { kind, line1: '', line2: null, city: '', state: '', zip: '', lived_from: null, lived_to: null };
}

export function ClaimProfileForm({ initial }: { initial: ClaimProfile }) {
  const current = currentAddressOf(initial) ?? emptyAddress('current');
  const [legalName, setLegalName] = useState(initial.legal_name ?? '');
  const [aliases, setAliases] = useState(initial.aliases ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [dob, setDob] = useState(initial.date_of_birth ?? '');
  const [payout, setPayout] = useState<PayoutPreference | ''>(initial.payout_preference ?? '');
  const [vin, setVin] = useState(initial.vehicle_vin ?? '');
  const [accountEmails, setAccountEmails] = useState(initial.account_emails.join('\n'));
  const [address, setAddress] = useState(current);
  const [prior, setPrior] = useState(initial.addresses.filter((a) => a.kind === 'prior'));
  const [consent, setConsent] = useState(Boolean(initial.consent_at));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setStatus('error');
      setMessage('Tick the box to save these details on your profile for claim forms.');
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/settings/claim-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: legalName,
          aliases,
          email,
          phone,
          date_of_birth: dob || null,
          payout_preference: payout || null,
          vehicle_vin: vin,
          account_emails: accountEmails,
          current_address: address.line1 ? address : null,
          prior_addresses: prior.filter((a) => a.line1.trim()),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'We couldn’t save your claim profile.');
        return;
      }
      setStatus('saved');
      setMessage('Saved. We will reuse this on claim forms.');
    } catch {
      setStatus('error');
      setMessage('We couldn’t save your claim profile. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Lawsuit AI never stores a Social Security number, full bank or routing
        number, payment-card number, or an official site’s login PIN or password.
        Payment preference is a method name only. {COLLECT_ADMIN_PIN_NOTE}
      </p>

      <Field label={CLAIM_PROFILE_FIELDS[0].label} help={CLAIM_PROFILE_FIELDS[0].help}>
        <input className="field-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS[1].label} help={CLAIM_PROFILE_FIELDS[1].help}>
        <input className="field-input" value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS[2].label} help={CLAIM_PROFILE_FIELDS[2].help}>
        <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS[3].label} help={CLAIM_PROFILE_FIELDS[3].help}>
        <input className="field-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </Field>

      <fieldset className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <legend className="px-1 text-sm font-bold">Current address</legend>
        <Field label="Street">
          <input className="field-input" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} autoComplete="address-line1" />
        </Field>
        <Field label="Apartment, suite or unit" help="Optional.">
          <input className="field-input" value={address.line2 ?? ''} onChange={(e) => setAddress({ ...address, line2: e.target.value || null })} autoComplete="address-line2" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City">
            <input className="field-input" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} autoComplete="address-level2" />
          </Field>
          <Field label="State">
            <select className="field-input" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })}>
              <option value="">Select</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.code}</option>
              ))}
            </select>
          </Field>
          <Field label="ZIP">
            <input className="field-input" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} autoComplete="postal-code" />
          </Field>
        </div>
        <Field label="Lived here since" help="Optional. Use YYYY-MM-DD.">
          <input className="field-input" type="date" value={address.lived_from ?? ''} onChange={(e) => setAddress({ ...address, lived_from: e.target.value || null })} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
        <legend className="px-1 text-sm font-bold">Prior addresses</legend>
        <p className="text-sm text-ink-muted">Addresses during a class period, with approximate dates. Optional unless a form asks.</p>
        {prior.map((row, i) => (
          <div key={row.id ?? i} className="space-y-3 rounded-xl border border-gray-100 p-4">
            <div className="flex justify-end">
              <button type="button" className="text-sm font-semibold text-red-700" onClick={() => setPrior(prior.filter((_, j) => j !== i))}>
                <Trash2 className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Remove
              </button>
            </div>
            <input className="field-input" placeholder="Street" value={row.line1} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, line1: e.target.value } : a))} />
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="field-input" placeholder="City" value={row.city} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, city: e.target.value } : a))} />
              <select className="field-input" value={row.state} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, state: e.target.value } : a))}>
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.code}</option>
                ))}
              </select>
              <input className="field-input" placeholder="ZIP" value={row.zip} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, zip: e.target.value } : a))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-ink-muted">From
                <input className="field-input mt-1" type="date" value={row.lived_from ?? ''} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, lived_from: e.target.value || null } : a))} />
              </label>
              <label className="text-xs font-semibold text-ink-muted">To
                <input className="field-input mt-1" type="date" value={row.lived_to ?? ''} onChange={(e) => setPrior(prior.map((a, j) => j === i ? { ...a, lived_to: e.target.value || null } : a))} />
              </label>
            </div>
          </div>
        ))}
        {prior.length < 8 && (
          <button type="button" className="btn-secondary" onClick={() => setPrior([...prior, emptyAddress('prior')])}>
            <Plus className="h-4 w-4" aria-hidden /> Add a prior address
          </button>
        )}
      </fieldset>

      <Field label={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'date_of_birth')!.label} help={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'date_of_birth')!.help}>
        <input className="field-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'payout_preference')!.label} help={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'payout_preference')!.help}>
        <select className="field-input" value={payout} onChange={(e) => setPayout(e.target.value as PayoutPreference | '')}>
          <option value="">No preference saved</option>
          {PAYOUT_PREFERENCES.map((value) => (
            <option key={value} value={value}>{PAYOUT_PREFERENCE_LABELS[value]}</option>
          ))}
        </select>
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'vehicle_vin')!.label} help={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'vehicle_vin')!.help}>
        <input className="field-input uppercase" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} />
      </Field>
      <Field label={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'account_emails')!.label} help={CLAIM_PROFILE_FIELDS.find((f) => f.key === 'account_emails')!.help}>
        <textarea className="field-input min-h-24" value={accountEmails} onChange={(e) => setAccountEmails(e.target.value)} placeholder="one email per line" />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Save these details on my Lawsuit AI profile and reuse them to prefill claim forms I start.
          I can edit or delete them anytime. This is not a signature on any settlement’s attestation.
        </span>
      </label>

      {message && (
        <p className={`flex items-start gap-2 text-sm ${status === 'error' ? 'text-red-700' : 'text-success-700'}`}>
          {status === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          {message}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={status === 'saving'}>
        {status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save claim profile
      </button>
    </form>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {help ? <span className="mt-0.5 block text-xs text-ink-muted">{help}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
