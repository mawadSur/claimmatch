'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function DismissMatchButton({ matchId, title }: { matchId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/matches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, dismissed: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Could not dismiss this match.');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach ClaimMatch.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink"
        onClick={() => void dismiss()}
        disabled={busy}
        aria-label={`Dismiss match: ${title}`}
      >
        {busy ? (
          <>
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden />
            Dismissing…
          </>
        ) : (
          'Dismiss'
        )}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
