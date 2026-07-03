'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export function EmailCapture({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (res.ok) {
        setState('done');
        setMessage(json.message || 'You’re on the list!');
      } else {
        setState('error');
        setMessage(json.error || 'Something went wrong.');
      }
    } catch {
      setState('error');
      setMessage('Network error — please try again.');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-700">
        <CheckCircle2 className="h-5 w-5" /> {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? 'flex gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="field-input flex-1"
      />
      <button type="submit" disabled={state === 'loading'} className="btn-primary shrink-0">
        {state === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>Notify me <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
      {state === 'error' && (
        <p className="w-full text-xs text-danger-700">{message}</p>
      )}
    </form>
  );
}
