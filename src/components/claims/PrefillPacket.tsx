'use client';

import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { US_STATES } from '@/lib/utils';
import type { Profile } from '@/lib/types';

type PacketFields = {
  full_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
};

const FIELD_LABELS: Record<keyof PacketFields, string> = {
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  city: 'City',
  state: 'State',
};

function formatPacketBlock(fields: PacketFields): string {
  const address = [fields.address_line1, fields.address_line2].filter(Boolean).join('\n');
  const cityLine = [fields.city, fields.state].filter(Boolean).join(', ');
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

/**
 * Copy-ready claim details from the signed-in profile. Saves address fields
 * through /api/settings (profile RLS). Does not write claims — ClaimFlow
 * handles tracking and "I filed".
 */
export function PrefillPacket({
  profile,
  lawsuitId,
  lawsuitSlug,
}: {
  profile: Profile | null;
  lawsuitId?: string;
  lawsuitSlug?: string;
}) {
  const posthog = usePostHog();
  const [fields, setFields] = useState<PacketFields>({
    full_name: profile?.full_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    address_line1: profile?.address_line1 || '',
    address_line2: profile?.address_line2 || '',
    city: profile?.city || '',
    state: profile?.state || '',
  });
  const [consent, setConsent] = useState(Boolean(profile?.prefill_consent_at));
  const [copied, setCopied] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  const needsConsent = !profile?.prefill_consent_at && !consent;
  const hasAddress = Boolean(fields.address_line1 || fields.city);
  const eventProps = { lawsuit_id: lawsuitId, slug: lawsuitSlug };

  useEffect(() => {
    posthog?.capture('prefill_opened', eventProps);
    // Once per mount: opening the packet is the start of the pre-fill step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posthog, lawsuitId, lawsuitSlug]);

  function update<K extends keyof PacketFields>(key: K, value: PacketFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      if (label === 'all') {
        posthog?.capture('prefill_completed', { ...eventProps, method: 'copy_all' });
      }
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function saveDetails() {
    if (hasAddress && needsConsent) {
      setSaveError('Check the box to save these details for future claims.');
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setSaveError('');
    try {
      const profilePatch: Record<string, unknown> = {
        full_name: fields.full_name,
        phone: fields.phone,
        state: fields.state,
      };
      if (hasAddress && (consent || profile?.prefill_consent_at)) {
        profilePatch.address_line1 = fields.address_line1;
        profilePatch.address_line2 = fields.address_line2;
        profilePatch.city = fields.city;
        if (!profile?.prefill_consent_at) {
          profilePatch.prefill_consent_at = new Date().toISOString();
        }
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePatch),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setSaveState('saved');
      posthog?.capture('prefill_completed', { ...eventProps, method: 'save' });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
      setSaveState('error');
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Your claim details</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Pre-filled from your profile. Edit anything that&rsquo;s wrong, then copy
            into the official form. ClaimMatch never files for you.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary !py-2 !px-3 text-xs"
          onClick={() => copyValue('all', formatPacketBlock(fields))}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied === 'all' ? 'Copied all' : 'Copy all'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(Object.keys(FIELD_LABELS) as (keyof PacketFields)[]).map((key) => (
          <label key={key} className={key === 'address_line1' || key === 'email' ? 'sm:col-span-2' : ''}>
            <span className="text-xs font-semibold text-ink-muted">{FIELD_LABELS[key]}</span>
            <span className="mt-1 flex gap-2">
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
                  type={key === 'email' ? 'email' : 'text'}
                  value={fields[key]}
                  onChange={(e) => update(key, e.target.value)}
                  autoComplete={
                    key === 'email' ? 'email' : key === 'phone' ? 'tel' : key.startsWith('address') ? 'street-address' : 'name'
                  }
                />
              )}
              <button
                type="button"
                className="btn-secondary !px-2 !py-2 text-xs"
                onClick={() => copyValue(key, fields[key])}
                disabled={!fields[key]}
              >
                {copied === key ? 'Copied' : 'Copy'}
              </button>
            </span>
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
          <span>Save this address on my profile for future claims.</span>
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary !py-2 text-sm" onClick={saveDetails} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save these details'}
        </button>
        {saveState === 'error' && <p className="text-sm text-danger-700">{saveError}</p>}
      </div>
    </div>
  );
}
