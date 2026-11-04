'use client';

import { useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type { ProfileFact } from '@/lib/types';
import {
  ProfileFactsFields,
  draftsFromFacts,
  draftsToPayload,
  type DraftFact,
} from './ProfileFactsFields';

export function ProfileFactsEditor({ initial }: { initial: ProfileFact[] }) {
  const [drafts, setDrafts] = useState<DraftFact[]>(() => draftsFromFacts(initial));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/profile-facts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: draftsToPayload(drafts) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('saved');
        setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
      } else {
        setStatus('error');
        setMessage(json.error || 'We couldn’t save your profile. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('We couldn’t reach ClaimMatch. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card" noValidate>
      <h2 className="text-lg font-bold">Purchases, work, and places</h2>
      <div className="mt-5">
        <ProfileFactsFields drafts={drafts} onChange={setDrafts} idPrefix="settings-facts" />
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-5 flex items-start gap-2 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {message}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : status === 'saved' ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> Saved
            </>
          ) : (
            'Save profile'
          )}
        </button>
      </div>
    </form>
  );
}
