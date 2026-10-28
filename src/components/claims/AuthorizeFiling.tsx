'use client';

import { useState } from 'react';
import { AUTHORIZATION_TEXT_V1, AUTHORIZATION_VERSION } from '@/lib/filing/authorization';

/**
 * Per-claim e-sign. The full text version is stored with the timestamp, IP
 * and user agent on the server. Hidden unless assisted filing is allowed.
 */
export function AuthorizeFiling({
  lawsuitId,
  claimId,
}: {
  lawsuitId: string;
  claimId: string | null;
}) {
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setStatus('error');
      setMessage('Check the box to confirm you have read the authorization.');
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/filing/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lawsuit_id: lawsuitId,
          claim_id: claimId,
          accepted: true,
          text_version: AUTHORIZATION_VERSION,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(json.error || 'We could not save your authorization.');
        return;
      }
      setStatus('saved');
      setMessage('Authorization saved. We will show progress on your dashboard.');
    } catch {
      setStatus('error');
      setMessage('We could not reach ClaimMatch. Try again in a minute.');
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/40 p-5"
    >
      <h3 className="text-base font-bold text-ink">Authorize this submission</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Optional. Only settlements on the allowlist can use this. You still review
        the official notice yourself.
      </p>
      <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-relaxed text-ink">
        {AUTHORIZATION_TEXT_V1}
      </div>
      <p className="mt-2 text-xs text-ink-muted">Version {AUTHORIZATION_VERSION}</p>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>I have read this authorization and attestation, and I agree.</span>
      </label>
      <button type="submit" className="btn-primary mt-4" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Sign and queue'}
      </button>
      {message && (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${status === 'error' ? 'text-danger-700' : 'text-ink-muted'}`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
