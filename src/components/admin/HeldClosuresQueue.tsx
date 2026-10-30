'use client';

import { useMemo, useState } from 'react';
import type { HeldClosureQueueItem } from '@/lib/held-closures';

const PAGE_SIZE = 25;

export function HeldClosuresQueue({ items }: { items: HeldClosureQueueItem[] }) {
  const [rows, setRows] = useState(items);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  function removeSlugs(slugs: string[]) {
    const drop = new Set(slugs);
    setRows((current) => current.filter((row) => !drop.has(row.slug)));
    setSelected((current) => {
      const next = { ...current };
      for (const slug of slugs) delete next[slug];
      return next;
    });
  }

  async function post(body: unknown): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/admin/held-closures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof json.error === 'string' ? json.error : 'Could not update.' };
    }
    return { ok: true };
  }

  async function act(row: HeldClosureQueueItem, action: 'approve' | 'dismiss') {
    setBusy(row.slug);
    setMessage(null);
    try {
      const result = await post({
        slug: row.slug,
        action,
        fingerprint: row.fingerprint,
        changes: row.changes,
        patch: row.patch,
      });
      if (!result.ok) {
        setMessage(result.error ?? 'Could not update this listing.');
        setBusy(null);
        return;
      }
      removeSlugs([row.slug]);
    } catch {
      setMessage('Could not reach ClaimMatch.');
    }
    setBusy(null);
  }

  async function bulkApprove() {
    const slugs = rows.filter((row) => selected[row.slug]).map((row) => row.slug);
    if (slugs.length === 0) {
      setMessage('Select at least one listing to approve.');
      return;
    }
    setBusy('bulk');
    setMessage(null);
    try {
      const result = await post({ slugs, action: 'bulk_approve' });
      if (!result.ok) {
        setMessage(result.error ?? 'Could not approve the selected listings.');
        setBusy(null);
        return;
      }
      removeSlugs(slugs);
    } catch {
      setMessage('Could not reach ClaimMatch.');
    }
    setBusy(null);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-sm text-ink-muted">
        No held closures waiting for review. A later ingest that plans a different
        close for a dismissed slug will list it again.
      </p>
    );
  }

  const selectedCount = rows.filter((row) => selected[row.slug]).length;

  return (
    <div className="space-y-4">
      {message && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {rows.length.toLocaleString()} held
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={busy !== null || selectedCount === 0}
          onClick={bulkApprove}
        >
          Approve selected
        </button>
      </div>
      <ul className="space-y-3">
        {visible.map((row) => (
          <li key={row.slug} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={Boolean(selected[row.slug])}
                onChange={(event) =>
                  setSelected((current) => ({ ...current, [row.slug]: event.target.checked }))
                }
                aria-label={`Select ${row.title}`}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-ink">{row.title}</h3>
                <p className="mt-1 font-mono text-xs text-ink-muted">{row.slug}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Now: {row.status ?? 'not in catalog'}
                  {row.deadline ? ` · deadline ${row.deadline}` : ' · no deadline on file'}
                </p>
                <p className="mt-1 text-sm text-ink">
                  Close would change: {row.changes.length ? row.changes.join('; ') : 'status → closed'}
                </p>
                {row.officialHref ? (
                  <a
                    href={row.officialHref}
                    className="mt-2 inline-block text-sm font-semibold text-brand-700 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.officialLabel ?? 'Official link'}
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">No official link on file.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy !== null}
                    onClick={() => act(row, 'approve')}
                  >
                    Approve close
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy !== null}
                    onClick={() => act(row, 'dismiss')}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Held closures pages">
          <button
            type="button"
            className="btn-secondary"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <p className="text-ink-muted">
            Page {safePage} of {totalPages}
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
