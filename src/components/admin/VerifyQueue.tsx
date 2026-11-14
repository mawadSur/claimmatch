'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, CheckCircle2, ShieldAlert, Tag } from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { formatProofFeedbackCounts, type ProofFeedbackCounts } from '@/lib/proof-feedback';
import { cn, formatDeadline } from '@/lib/utils';
import {
  VerifiedFieldsEditor,
  draftFromLawsuit,
  parseFormFieldOrderInput,
  type VerifiedDraft,
} from './VerifiedFieldsEditor';
import { VerificationDraftPanel } from './VerificationDraftPanel';
import type { VerificationDraft } from '@/lib/verification-drafts-store';
import {
  VERIFY_ASSIST_SHORTCUTS,
  applyAssistDraftToEditor,
  sortVerifyQueue,
  type VerifyQueueStats,
} from '@/lib/verification-draft-ui';

type Action = 'verify' | 'unverify' | 'update';
type AssistAction = 'accept' | 'reject' | 'close' | 'republish_verify' | 'draft';

interface Row {
  lawsuit: Lawsuit;
  verified: VerifiedDraft;
  busy: Action | AssistAction | null;
  message: { tone: 'success' | 'error'; text: string } | null;
  draft: VerificationDraft | null;
}

function makeRow(l: Lawsuit, draft: VerificationDraft | null): Row {
  return { lawsuit: l, verified: draftFromLawsuit(l), busy: null, message: null, draft };
}

export function VerifyQueue({
  items,
  feedbackCounts = {},
  drafts = {},
  stats = {},
  assistEnabled = false,
}: {
  items: Lawsuit[];
  feedbackCounts?: Record<string, ProofFeedbackCounts>;
  drafts?: Record<string, VerificationDraft>;
  stats?: Record<string, VerifyQueueStats>;
  assistEnabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const initial = items.map((item) => makeRow(item, drafts[item.id] ?? null));
    return assistEnabled ? sortVerifyQueue(initial, stats) : initial;
  });
  const [focus, setFocus] = useState(0);

  const visible = useMemo(() => rows, [rows]);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.lawsuit.id === id ? { ...r, ...patch } : r)));
  }

  async function act(row: Row, action: Action) {
    const id = row.lawsuit.id;
    const patch = {
      eligibility_verified: row.verified.eligibilityVerified,
      proof_verified: row.verified.proofVerified || null,
      administrator: row.verified.administrator,
      form_field_order: parseFormFieldOrderInput(row.verified.formFieldOrder),
      final_approval_hearing_at: row.verified.finalApprovalHearingAt || null,
      payment_timing_text: row.verified.paymentTimingText,
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

  async function assist(row: Row, action: AssistAction) {
    const id = row.lawsuit.id;
    patchRow(id, { busy: action, message: null });
    try {
      if (action === 'draft') {
        const res = await fetch('/api/admin/verification-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lawsuitId: id }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          patchRow(id, {
            busy: null,
            message: { tone: 'error', text: json?.error || 'Could not draft from the official site.' },
          });
          return;
        }
        patchRow(id, {
          busy: null,
          message: { tone: 'success', text: 'Draft job finished. Reload to see a new draft.' },
        });
        return;
      }
      if (!row.draft) {
        patchRow(id, { busy: null, message: { tone: 'error', text: 'No pending draft.' } });
        return;
      }
      const applied = action === 'accept' ? applyAssistDraftToEditor(row.verified, row.draft) : row.verified;
      const res = await fetch('/api/admin/verification-drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.draft.id,
          action,
          fields:
            action === 'accept' || action === 'republish_verify'
              ? {
                  eligibility_verified: applied.eligibilityVerified,
                  proof_verified: applied.proofVerified || null,
                  administrator: applied.administrator,
                  deadline: row.draft.deadline,
                }
              : undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        patchRow(id, {
          busy: null,
          message: { tone: 'error', text: json?.error || 'Action failed — please try again.' },
        });
        return;
      }
      if (action === 'close' || action === 'reject') {
        setRows((rs) => rs.filter((r) => r.lawsuit.id !== id));
        return;
      }
      const updated = (json.lawsuit as Lawsuit | undefined) ?? row.lawsuit;
      const saved =
        action === 'accept'
          ? 'Draft accepted and marked verified.'
          : 'Republished and marked verified.';
      patchRow(id, {
        busy: null,
        lawsuit: updated,
        verified: draftFromLawsuit(updated),
        draft: null,
        message: { tone: 'success', text: saved },
      });
    } catch {
      patchRow(id, {
        busy: null,
        message: { tone: 'error', text: 'Network error — please try again.' },
      });
    }
  }

  useEffect(() => {
    if (!assistEnabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      const row = visible[focus];
      if (!row) return;
      const key = event.key.toLowerCase();
      if (key === VERIFY_ASSIST_SHORTCUTS.next) {
        event.preventDefault();
        setFocus((i) => Math.min(visible.length - 1, i + 1));
      } else if (key === VERIFY_ASSIST_SHORTCUTS.prev) {
        event.preventDefault();
        setFocus((i) => Math.max(0, i - 1));
      } else if (key === VERIFY_ASSIST_SHORTCUTS.accept && row.draft) {
        event.preventDefault();
        void assist(row, 'accept');
      } else if (key === VERIFY_ASSIST_SHORTCUTS.reject && row.draft) {
        event.preventDefault();
        void assist(row, 'reject');
      } else if (key === VERIFY_ASSIST_SHORTCUTS.close && row.draft) {
        event.preventDefault();
        void assist(row, 'close');
      } else if (key === VERIFY_ASSIST_SHORTCUTS.republish && row.draft) {
        event.preventDefault();
        void assist(row, 'republish_verify');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assistEnabled, focus, visible]); // eslint-disable-line react-hooks/exhaustive-deps -- rebind on the visible row set

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-ink-muted shadow-card">
        No published or pending listings to verify.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((row, index) => {
        const l = row.lawsuit;
        const counts = feedbackCounts[l.id];
        const focused = assistEnabled && index === focus;
        return (
          <article
            key={l.id}
            id={`verify-row-${l.id}`}
            tabIndex={-1}
            className={cn(
              'rounded-2xl border bg-white p-5 shadow-card sm:p-6',
              focused ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-100',
            )}
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
              {counts && counts.total > 0 ? (
                <span>{formatProofFeedbackCounts(counts)}</span>
              ) : null}
              {stats[l.id] ? (
                <span>
                  {stats[l.id].matchCount} matches · {stats[l.id].viewCount} views
                </span>
              ) : null}
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

            {assistEnabled && row.draft ? (
              <VerificationDraftPanel
                lawsuit={l}
                draft={row.draft}
                busy={row.busy !== null}
                onAcceptAll={() => assist(row, 'accept')}
                onReject={() => assist(row, 'reject')}
                onClose={() => assist(row, 'close')}
                onRepublish={() => assist(row, 'republish_verify')}
              />
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => act(row, 'update')}
                disabled={row.busy !== null}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Save fields without marking verified
              </button>
              {assistEnabled ? (
                <button
                  type="button"
                  onClick={() => assist(row, 'draft')}
                  disabled={row.busy !== null}
                  className="btn-ghost px-3 py-1.5 text-sm"
                >
                  Draft from official site
                </button>
              ) : null}
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
