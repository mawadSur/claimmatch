'use client';

import { useState } from 'react';
import { Building2, CalendarClock, CheckCircle2, ShieldAlert, Tag } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { cn, formatDeadline } from '@/lib/utils';
import {
  VerifiedFieldsEditor,
  draftFromLawsuit,
  type VerifiedDraft,
} from './VerifiedFieldsEditor';

type Action = 'verify' | 'unverify' | 'update';

interface Row {
  lawsuit: Lawsuit;
  verified: VerifiedDraft;
  busy: Action | null;
  message: { tone: 'success' | 'error'; text: string } | null;
}

function makeRow(l: Lawsuit): Row {
  return { lawsuit: l, verified: draftFromLawsuit(l), busy: null, message: null };
}

export function VerifyQueue({ items }: { items: Lawsuit[] }) {
  const [rows, setRows] = useState<Row[]>(() => items.map(makeRow));

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.lawsuit.id === id ? { ...r, ...patch } : r)));
  }

  async function act(row: Row, action: Action) {
    const id = row.lawsuit.id;
    const patch = {
      eligibility_verified: row.verified.eligibilityVerified,
      proof_verified: row.verified.proofVerified || null,
      administrator: row.verified.administrator,
    };

    patchRow(id, { busy: action, message: null });
    try {
      const res = await fetch('/api/admin/lawsuits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, patch }),
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
      const updated = (json.lawsuit as Lawsuit | undefined) ?? row.lawsuit;
      const saved =
        action === 'verify'
          ? 'Marked verified.'
          : action === 'unverify'
            ? 'Verification cleared.'
            : 'Saved.';
      patchRow(id, {
        busy: null,
        lawsuit: updated,
        verified: draftFromLawsuit(updated),
        message: { tone: 'success', text: saved },
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
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-ink-muted shadow-card">
        No published or pending listings to verify.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((row) => {
        const l = row.lawsuit;
        return (
          <article
            key={l.id}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-gray gap-1">
                <Tag className="h-3 w-3" /> {l.category}
              </span>
              <span className="badge-gray">{l.review_status.replace('_', ' ')}</span>
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

            <VerifiedFieldsEditor
              id={l.id}
              lawsuit={l}
              draft={row.verified}
              busy={row.busy !== null}
              onChange={(verified) => patchRow(l.id, { verified, message: null })}
              onVerify={() => act(row, 'verify')}
              onUnverify={() => act(row, 'unverify')}
            />

            <div className="mt-3">
              <button
                type="button"
                onClick={() => act(row, 'update')}
                disabled={row.busy !== null}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Save fields without marking verified
              </button>
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
          </article>
        );
      })}
    </div>
  );
}
