'use client';

import { useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { answersFromAttributes, type AttributeAnswers } from '@/lib/profile-attributes';
import { US_STATES } from '@/lib/utils';
import { ProfileAttributesFields } from './ProfileAttributesFields';

/**
 * Settings form: the user's details and their email choice. There is no SMS
 * feature, so there is no text-message opt-in.
 */
export function NotificationPrefs({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [state, setState] = useState(profile.state ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [emailOptIn, setEmailOptIn] = useState(profile.email_opt_in);
  const [answers, setAnswers] = useState<AttributeAnswers>(() =>
    answersFromAttributes(profile.attributes),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          state,
          phone,
          email_opt_in: emailOptIn,
          attributes: answers,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('saved');
        setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
      } else {
        setStatus('error');
        setMessage(json.error || 'We couldn’t save your changes. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('We couldn’t reach ClaimMatch. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card" noValidate>
      <h2 className="text-lg font-bold">Your details and emails</h2>
      <p className="mt-1 text-sm text-ink-muted">
        We keep these on your account. We never send them to settlement sites; you
        enter your own details when you file on the official site.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            className="field-input"
            value={fullName}
            autoComplete="name"
            maxLength={120}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your legal name"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="state">State</label>
          <select
            id="state"
            className="field-input"
            value={state}
            autoComplete="address-level1"
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Select a state</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="phone">Phone number (optional)</label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={32}
            className="field-input"
            value={phone}
            aria-describedby="phone-hint"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
          />
          <p id="phone-hint" className="mt-1.5 text-xs text-ink-muted">
            We’ll only use this to help you fill in claim forms, once that feature is
            ready. We don’t send text messages.
          </p>
        </div>
      </div>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <h3 className="text-base font-bold">Settlements that may apply to you</h3>
        <p className="mt-1 text-sm text-ink-muted">
          These answers help us rank open settlements. You can change them anytime.
        </p>
        <div className="mt-4">
          <ProfileAttributesFields idPrefix="settings" answers={answers} onChange={setAnswers} />
        </div>
      </div>

      <div className="mt-5">
        <Toggle
          id="email-opt-in"
          checked={emailOptIn}
          onChange={setEmailOptIn}
          label="Email me about new settlements"
          hint="These emails are paused for now. Leave this on to get them when they restart. Account emails and important notices about your claims come either way."
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            'Save changes'
          )}
        </button>
        <div aria-live="polite" role="status" className="text-sm">
          {status === 'saved' && (
            <span className="flex items-center gap-1 font-medium text-success-700">
              <Check className="h-4 w-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
        </p>
      )}
    </form>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div>
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-ink">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-muted">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
          checked ? 'bg-brand-600' : 'bg-gray-500'
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
