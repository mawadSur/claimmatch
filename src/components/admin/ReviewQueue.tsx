'use client';

import { useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Save,
  ShieldAlert,
  Building2,
  CalendarClock,
  Tag,
  Inbox,
} from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { cn, formatDeadline } from '@/lib/utils';

type Action = 'publish' | 'reject' | 'update';

interface Row {
  lawsuit: Lawsuit;
  eligibilityText: string;
  eligibilityJson: string;
  busy: Action | null;
  message: { tone: 'success' | 'error'; text: string } | null;
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function makeRow(l: Lawsuit): Row {
  return {
    lawsuit: l,
    eligibilityText: l.eligibility_text ?? '',
    eligibilityJson: toJson(l.eligibility),
    busy: null,
    message: null,
  };
}

/**
 * Review-and-moderate UI for pending settlements. Each card lets an admin edit
 * the eligibility copy + rules, then Publish / Save / Reject. Every action hits
 * PATCH /api/admin/lawsuits; publish and reject drop the row from the queue.
 */
export function ReviewQueue({ items }: { items: Lawsuit[] }) {
  const [rows, setRows] = useState<Row[]>(() => items.map(makeRow));

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.lawsuit.id === id ? { ...r, ...patch } : r)));
  }

  async function act(row: Row, action: Action) {
    const id = row.lawsuit.id;

    let payloadPatch: Record<string, unknown> | undefined;
    if (action === 'update') {
      let eligibility: unknown;
      try {
        eligibility = row.eligibilityJson.trim()
          ? JSON.parse(row.eligibilityJson)
          : {};
      } catch {
        patchRow(id, {
          message: {
            tone: 'error',
            text: 'Eligibility JSON is invalid — fix it before saving.',
          },
        });
        return;
      }
      payloadPatch = {
        eligibility_text: row.eligibilityText,
        eligibility,
      };
    }

    patchRow(id, { busy: action, message: null });

    try {
      const res = await fetch('/api/admin/lawsuits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, patch: payloadPatch }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        patchRow(id, {
          busy: null,
          message: {
            tone: 'error',
            text: json?.error || 'Action failed — please try again.',
          },
        });
        return;
      }

      if (action === 'publish' || action === 'reject') {
        // Row leaves the queue on a terminal decision.
        setRows((rs) => rs.filter((r) => r.lawsuit.id !== id));
        return;
      }

      // update — reflect the persisted row + confirm.
      const updated = (json.lawsuit as Lawsuit | undefined) ?? row.lawsuit;
      patchRow(id, {
        busy: null,
        lawsuit: updated,
        eligibilityText: updated.eligibility_text ?? row.eligibilityText,
        eligibilityJson: toJson(updated.eligibility),
        message: { tone: 'success', text: 'Saved.' },
      });
    } catch {
      patchRow(id, {
        busy: null,
        message: { tone: 'error', text: 'Network error — please try again.' },
      });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-success-50 text-success-600">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold">Queue cleared</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Nothing is waiting for review. New extractions land here for a human
          check before they publish.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((row) => {
        const l = row.lawsuit;
        const conf = l.extraction_confidence;
        const confidence = conf != null ? `${Math.round(conf * 100)}%` : '—';
        const confTone =
          conf == null
            ? 'bg-gray-100 text-gray-600'
            : conf >= 0.8
              ? 'bg-success-50 text-success-700'
              : conf >= 0.5
                ? 'bg-brand-100 text-brand-700'
                : 'bg-danger-50 text-danger-700';

        return (
          <article
            key={l.id}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-gray gap-1">
                <Tag className="h-3 w-3" /> {l.category}
              </span>
              <span className={cn('badge gap-1', confTone)}>
                {confidence} confidence
              </span>
            </div>

            <h3 className="mt-2 text-lg font-bold text-ink">{l.title}</h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {l.administrator || 'Unknown administrator'}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                Deadline {formatDeadline(l.deadline)}
              </span>
            </div>

            {l.summary && (
              <p className="mt-3 text-sm text-ink-muted">{l.summary}</p>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="field-label" htmlFor={`elig-text-${l.id}`}>
                  Eligibility (plain English)
                </label>
                <textarea
                  id={`elig-text-${l.id}`}
                  rows={5}
                  className="field-input"
                  placeholder="Who qualifies for this settlement?"
                  value={row.eligibilityText}
                  onChange={(e) =>
                    patchRow(l.id, {
                      eligibilityText: e.target.value,
                      message: null,
                    })
                  }
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`elig-json-${l.id}`}>
                  Eligibility rules (JSON)
                </label>
                <textarea
                  id={`elig-json-${l.id}`}
                  rows={5}
                  spellCheck={false}
                  className="field-input font-mono text-xs"
                  value={row.eligibilityJson}
                  onChange={(e) =>
                    patchRow(l.id, {
                      eligibilityJson: e.target.value,
                      message: null,
                    })
                  }
                />
              </div>
            </div>

            {row.message && (
              <div
                className={cn(
                  'mt-4 flex items-center gap-2 rounded-xl p-3 text-sm',
                  row.message.tone === 'success'
                    ? 'bg-success-50 text-success-700'
                    : 'bg-danger-50 text-danger-700',
                )}
              >
                {row.message.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                )}
                {row.message.text}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => act(row, 'publish')}
                disabled={row.busy !== null}
                className="btn-success"
              >
                {row.busy === 'publish' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Publish
              </button>
              <button
                type="button"
                onClick={() => act(row, 'update')}
                disabled={row.busy !== null}
                className="btn-secondary"
              >
                {row.busy === 'update' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save edits
              </button>
              <button
                type="button"
                onClick={() => act(row, 'reject')}
                disabled={row.busy !== null}
                className="btn-ghost text-danger-700 hover:bg-danger-50"
              >
                {row.busy === 'reject' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
