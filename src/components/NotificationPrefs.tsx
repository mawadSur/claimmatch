'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { US_STATES } from '@/lib/utils';

export function NotificationPrefs({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [state, setState] = useState(profile.state ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [emailOptIn, setEmailOptIn] = useState(profile.email_opt_in);
  const [smsOptIn, setSmsOptIn] = useState(profile.sms_opt_in);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          state,
          phone,
          email_opt_in: emailOptIn,
          sms_opt_in: smsOptIn,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setMessage(json.error || 'Could not save.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error — please try again.');
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold">Profile &amp; alerts</h2>
      <p className="mt-1 text-sm text-ink-muted">
        We use these to match you and tell you the moment a new settlement opens.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="fullName">Full name</label>
          <input id="fullName" className="field-input" value={fullName}
            onChange={(e) => setFullName(e.target.value)} placeholder="Your legal name" />
        </div>
        <div>
          <label className="field-label" htmlFor="state">State</label>
          <select id="state" className="field-input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Select a state</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="phone">Mobile (for text alerts)</label>
          <input id="phone" type="tel" className="field-input" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Toggle
          checked={emailOptIn}
          onChange={setEmailOptIn}
          label="Email me new settlement matches"
          hint="A note the moment you qualify for a new one."
        />
        <Toggle
          checked={smsOptIn}
          onChange={setSmsOptIn}
          label="Text me time-sensitive alerts"
          hint="Only for deadlines closing soon. Standard rates apply."
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
        </button>
        {status === 'saved' && (
          <span className="flex items-center gap-1 text-sm font-medium text-success-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {status === 'error' && <span className="text-sm text-danger-700">{message}</span>}
      </div>
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-brand-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}
