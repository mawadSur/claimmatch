'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function RevealContact({ userId }: { userId: string }) {
  const [status, setStatus] = useState<'hidden' | 'loading' | 'shown' | 'error'>('hidden');
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reveal`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setError(json.error || 'Could not reveal contact.');
        return;
      }
      setEmail(json.email ?? null);
      setPhone(json.phone ?? null);
      setName(json.full_name ?? null);
      setStatus('shown');
    } catch {
      setStatus('error');
      setError('Could not reach Lawsuit AI.');
    }
  }

  if (status === 'shown') {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Revealed contact (this view was logged)</p>
        <p className="mt-2">Name: {name || '—'}</p>
        <p>Email: {email || '—'}</p>
        <p>Phone: {phone || '—'}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button type="button" className="btn-secondary" onClick={() => void reveal()} disabled={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revealing…
          </>
        ) : (
          'Reveal contact'
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
