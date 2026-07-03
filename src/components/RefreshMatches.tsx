'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

/**
 * Small dashboard button that recomputes the current user's matches
 * (POST /api/matches) then refreshes the server component tree so the new
 * matches render. Shows a spinner while the request + refresh are in flight.
 */
export function RefreshMatches() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const busy = loading || isPending;

  async function refresh() {
    if (busy) return;
    setLoading(true);
    try {
      await fetch('/api/matches', { method: 'POST' });
    } catch {
      // Non-fatal — refresh anyway so the UI reflects any current state.
    } finally {
      setLoading(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      className="btn-secondary text-sm"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {busy ? 'Refreshing…' : 'Refresh matches'}
    </button>
  );
}
