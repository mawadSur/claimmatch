'use client';

import { useState } from 'react';

/**
 * Self-serve account deletion. Requires typing DELETE. The API removes the
 * profile, attributes, claims, recoveries and the auth user.
 */
export function DeleteAccount() {
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error || 'Could not delete the account.');
        setStatus('error');
        return;
      }
      window.location.assign('/');
    } catch {
      setError('Could not delete the account.');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-bold text-ink">Delete my account and data</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        This removes your profile, the answers we use to find settlements,
        claims, and payout notes. Type DELETE to confirm.
      </p>
      <input
        type="text"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="off"
        aria-label="Type DELETE to confirm"
        className="mt-3 w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="DELETE"
      />
      <button
        type="submit"
        className="btn-ghost mt-3 text-sm text-danger-700"
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Deleting…' : 'Delete my account and data'}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
