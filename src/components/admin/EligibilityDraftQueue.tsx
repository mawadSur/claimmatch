'use client';

import { useState } from 'react';
import type { EligibilityCriteria, EligibilityRuleDraft } from '@/lib/types';

type DraftRow = EligibilityRuleDraft & {
  lawsuit_title?: string;
  lawsuit_slug?: string;
  deadline?: string | null;
};

export function EligibilityDraftQueue({ items }: { items: DraftRow[] }) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/eligibility-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || 'Could not update this draft.');
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
        No pending eligibility drafts.
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
      {rows.map((row) => (
        <article key={row.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
          <h3 className="text-base font-bold text-ink">{row.lawsuit_title ?? row.lawsuit_id}</h3>
          {row.lawsuit_slug && (
            <p className="mt-1 font-mono text-xs text-ink-muted">{row.lawsuit_slug}</p>
          )}
          <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-ink">
            {JSON.stringify(row.eligibility as EligibilityCriteria, null, 2)}
          </pre>
          {row.source_excerpt && (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{row.source_excerpt}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy === row.id}
              onClick={() => act(row.id, 'approve')}
            >
              Approve and apply
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy === row.id}
              onClick={() => act(row.id, 'reject')}
            >
              Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
