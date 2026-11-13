'use client';

import { ExternalLink, Quote } from 'lucide-react';
import { formatDeadline } from '@/lib/utils';
import type { Lawsuit } from '@/lib/types';
import type { VerificationDraft } from '@/lib/verification-drafts-store';
import {
  VERIFY_ASSIST_FIELD_KEYS,
  type VerifyAssistFieldKey,
} from '@/lib/verification-draft';
import { canCloseFromDraft, canRepublishFromDraft } from '@/lib/verification-draft-ui';

const FIELD_LABEL: Record<VerifyAssistFieldKey, string> = {
  deadline: 'Claim deadline',
  claims_status: 'Claims open/closed',
  eligibility_verified: 'Who qualifies',
  proof_verified: 'Proof required',
  administrator: 'Administrator',
};

function currentValue(lawsuit: Lawsuit, key: VerifyAssistFieldKey): string {
  switch (key) {
    case 'deadline':
      return formatDeadline(lawsuit.deadline);
    case 'claims_status':
      return lawsuit.status === 'closed' ? 'closed' : lawsuit.status;
    case 'eligibility_verified':
      return lawsuit.eligibility_verified?.trim() || lawsuit.eligibility_text?.trim() || '—';
    case 'proof_verified':
      return lawsuit.proof_verified || (lawsuit.proof_required ? 'yes' : 'unset');
    case 'administrator':
      return lawsuit.administrator?.trim() || '—';
  }
}

function draftValue(draft: VerificationDraft, key: VerifyAssistFieldKey): string {
  switch (key) {
    case 'deadline':
      return draft.deadline ? formatDeadline(draft.deadline) : 'unknown';
    case 'claims_status':
      return draft.claims_status ?? 'unknown';
    case 'eligibility_verified':
      return draft.eligibility_verified?.trim() || 'unknown';
    case 'proof_verified':
      return draft.proof_verified ?? 'unknown';
    case 'administrator':
      return draft.administrator?.trim() || 'unknown';
  }
}

/**
 * Admin-only comparison of a verification draft against stored values.
 * Drafts are never shown on public pages.
 */
export function VerificationDraftPanel({
  lawsuit,
  draft,
  busy,
  onAcceptAll,
  onReject,
  onClose,
  onRepublish,
}: {
  lawsuit: Lawsuit;
  draft: VerificationDraft;
  busy: boolean;
  onAcceptAll: () => void;
  onReject: () => void;
  onClose: () => void;
  onRepublish: () => void;
}) {
  const closeOk = canCloseFromDraft(draft);
  const republishOk = canRepublishFromDraft(draft);
  return (
    <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">Site-check draft</h4>
        <p className="text-xs text-ink-muted">
          Admin only. Not shown publicly. Does not mark the listing verified until you accept.
        </p>
      </div>
      <div className="mt-3 grid gap-3">
        {VERIFY_ASSIST_FIELD_KEYS.map((key) => {
          const evidence = draft.evidence?.[key];
          return (
            <div key={key} className="rounded-lg border border-gray-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{FIELD_LABEL[key]}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <p className="text-sm text-ink-soft">
                  <span className="font-medium text-ink-muted">Now: </span>
                  {currentValue(lawsuit, key)}
                </p>
                <p className="text-sm text-ink">
                  <span className="font-medium text-ink-muted">Draft: </span>
                  {draftValue(draft, key)}
                </p>
              </div>
              {evidence?.quote ? (
                <p className="mt-2 flex gap-1.5 text-xs text-ink-muted">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>
                    “{evidence.quote}”
                    {evidence.source_url ? (
                      <>
                        {' '}
                        <a
                          href={evidence.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-brand-700 underline"
                        >
                          Source
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </>
                    ) : null}
                  </span>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAcceptAll}
          disabled={busy}
          className="btn-success px-3 py-1.5 text-sm"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="btn-ghost px-3 py-1.5 text-sm text-ink-muted"
        >
          Reject
        </button>
        {closeOk ? (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost px-3 py-1.5 text-sm text-danger-700 hover:bg-danger-50"
          >
            Close
          </button>
        ) : null}
        {republishOk ? (
          <button
            type="button"
            onClick={onRepublish}
            disabled={busy}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            Republish + verify
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Keyboard: J/K move, A accept all, R reject
        {closeOk ? ', C close' : ''}
        {republishOk ? ', P republish' : ''}.
      </p>
    </div>
  );
}
