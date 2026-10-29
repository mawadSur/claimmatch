'use client';

import { useState } from 'react';
import type { MissingFeedCandidate } from '@/lib/missing-feed-queue';

export function MissingFeedQueue({
  items,
  closeAfter,
}: {
  items: MissingFeedCandidate[];
  closeAfter: number;
}) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(id: string, action: 'close_missing' | 'keep_missing') {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/lawsuits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof json.error === 'string' ? json.error : 'Could not update this listing.');
        setBusy(null);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
    } catch {
      setMessage('Could not reach ClaimMatch.');
    }
    setBusy(null);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-sm text-ink-muted">
        No open SettleSignal listings are missing from {closeAfter} consecutive successful feeds.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {message}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
            <h3 className="text-base font-bold text-ink">{row.title}</h3>
            <p className="mt-1 font-mono text-xs text-ink-muted">{row.slug}</p>
            <p className="mt-2 text-sm text-ink-muted">
              Missing from feed, propose close · missed {row.missed_feed_count} successful feed
              {row.missed_feed_count === 1 ? '' : 's'}
              {row.deadline ? ` · deadline ${row.deadline}` : ''}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={busy === row.id}
                onClick={() => act(row.id, 'close_missing')}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy === row.id}
                onClick={() => act(row.id, 'keep_missing')}
              >
                Keep open
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
