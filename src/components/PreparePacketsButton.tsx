'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function PreparePacketsButton({ count }: { count: number }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [prepared, setPrepared] = useState(0);

  async function run() {
    setState('loading');
    try {
      const res = await fetch('/api/claims/prepare-all', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setPrepared(json.prepared ?? 0);
      setState('done');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  if (count < 2) return null;

  return (
    <div>
      <button type="button" className="btn-secondary" onClick={run} disabled={state === 'loading'}>
        {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Prepare all {count} packets
      </button>
      {state === 'done' && (
        <p className="mt-2 text-sm text-success-600">
          Prepared {prepared} packet{prepared === 1 ? '' : 's'}. Open each one to copy and submit.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-2 text-sm text-danger-600">Could not prepare packets. Try again.</p>
      )}
    </div>
  );
}
