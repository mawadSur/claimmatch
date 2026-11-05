'use client';

import { useState } from 'react';

/**
 * Downloads the signed-in user's stored data as JSON from /api/account/export.
 */
export function DownloadMyData() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onClick() {
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error || 'Could not download your data.');
        setStatus('error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'claimmatch-data.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('idle');
    } catch {
      setError('Could not download your data.');
      setStatus('error');
    }
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold text-ink">Download my data</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Get a JSON copy of your profile, facts, consent records, stored
        matches, and claims.
      </p>
      <button
        type="button"
        className="btn-secondary mt-3 text-sm"
        onClick={onClick}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Preparing…' : 'Download my data'}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
