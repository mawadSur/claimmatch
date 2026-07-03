'use client';

import { useState } from 'react';
import { Loader2, Star, StarOff, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { Lawsuit, ReviewStatus } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';

type Busy = 'feature' | 'publish' | null;

interface Row {
  lawsuit: Lawsuit;
  busy: Busy;
  error: string | null;
}

const STATUS_TONE: Record<ReviewStatus, string> = {
  published: 'badge-green',
  pending_review: 'badge-brand',
  draft: 'badge-gray',
  rejected: 'badge-red',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  published: 'Published',
  pending_review: 'Pending',
  draft: 'Draft',
  rejected: 'Rejected',
};

/**
 * Inline catalog moderation table. Each row toggles is_featured and
 * publishes/unpublishes via PATCH /api/admin/lawsuits {action:'update', patch}.
 */
export function CatalogTable({ rows: initial }: { rows: Lawsuit[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((l) => ({ lawsuit: l, busy: null, error: null })),
  );

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.lawsuit.id === id ? { ...r, ...patch } : r)));
  }

  async function patchLawsuit(row: Row, busy: Busy, patch: Record<string, unknown>) {
    const id = row.lawsuit.id;
    update(id, { busy, error: null });
    try {
      const res = await fetch('/api/admin/lawsuits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'update', patch }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        update(id, { busy: null, error: json?.error || 'Update failed.' });
        return;
      }
      update(id, {
        busy: null,
        error: null,
        lawsuit: (json.lawsuit as Lawsuit | undefined) ?? row.lawsuit,
      });
    } catch {
      update(id, { busy: null, error: 'Network error.' });
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-ink-muted shadow-card">
        No settlements in the catalog yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-card">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-3 font-semibold">Settlement</th>
            <th className="px-4 py-3 font-semibold">Category</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Deadline</th>
            <th className="px-4 py-3 font-semibold">Featured</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const l = row.lawsuit;
            const published = l.review_status === 'published';
            return (
              <tr
                key={l.id}
                className="border-b border-gray-50 align-middle last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="max-w-[280px] truncate font-semibold text-ink">
                    {l.title}
                  </div>
                  <div className="text-xs text-ink-soft">/{l.slug}</div>
                  {row.error && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-danger-700">
                      <AlertCircle className="h-3 w-3" /> {row.error}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{l.category}</td>
                <td className="px-4 py-3">
                  <span className={STATUS_TONE[l.review_status] ?? 'badge-gray'}>
                    {STATUS_LABEL[l.review_status] ?? l.review_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {formatDeadline(l.deadline)}
                </td>
                <td className="px-4 py-3">
                  {l.is_featured ? (
                    <span className="badge-brand">Featured</span>
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={row.busy !== null}
                      onClick={() =>
                        patchLawsuit(row, 'feature', {
                          is_featured: !l.is_featured,
                        })
                      }
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      {row.busy === 'feature' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : l.is_featured ? (
                        <StarOff className="h-3.5 w-3.5" />
                      ) : (
                        <Star className="h-3.5 w-3.5" />
                      )}
                      {l.is_featured ? 'Unfeature' : 'Feature'}
                    </button>
                    <button
                      type="button"
                      disabled={row.busy !== null}
                      onClick={() =>
                        patchLawsuit(row, 'publish', {
                          review_status: published ? 'draft' : 'published',
                        })
                      }
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      {row.busy === 'publish' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : published ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {published ? 'Unpublish' : 'Publish'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
