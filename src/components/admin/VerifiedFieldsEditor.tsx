'use client';

import { BadgeCheck, Loader2, ShieldOff } from 'lucide-react';
import type { Lawsuit, ProofRequired } from '@/lib/types';
import { isVerifiedRecord, verifiedOnLabel } from '@/lib/verified-fields';

const PROOF_OPTIONS: { value: '' | ProofRequired; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'yes', label: 'Required' },
  { value: 'no', label: 'Not required' },
  { value: 'optional', label: 'Optional' },
  { value: 'unknown', label: 'Unknown' },
];

export type VerifiedDraft = {
  eligibilityVerified: string;
  proofVerified: '' | ProofRequired;
  administrator: string;
  formFieldOrder: string;
};

export function parseFormFieldOrderInput(raw: string): string[] | null {
  const keys = raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return keys.length > 0 ? keys : null;
}

export function draftFromLawsuit(l: Lawsuit): VerifiedDraft {
  return {
    eligibilityVerified: l.eligibility_verified ?? '',
    proofVerified: l.proof_verified ?? '',
    administrator: l.administrator ?? '',
    formFieldOrder: (l.form_field_order ?? []).join(', '),
  };
}

export function VerifiedFieldsEditor({
  id,
  lawsuit,
  draft,
  busy,
  onChange,
  onVerify,
  onUnverify,
}: {
  id: string;
  lawsuit: Lawsuit;
  draft: VerifiedDraft;
  busy: boolean;
  onChange: (draft: VerifiedDraft) => void;
  onVerify: () => void;
  onUnverify: () => void;
}) {
  const stamped = isVerifiedRecord(lawsuit);
  const stampLabel = verifiedOnLabel(lawsuit.verified_at);

  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">Verified fields</h4>
        {stamped && stampLabel ? (
          <span className="badge-green gap-1">
            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            {stampLabel}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Not marked verified</span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Who qualifies, proof, and the administrator as you checked them against
        the official notice. The public badge stays off until the verified-fields
        flag is on.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label className="field-label" htmlFor={`elig-verified-${id}`}>
            Who qualifies (verified)
          </label>
          <textarea
            id={`elig-verified-${id}`}
            rows={4}
            className="field-input"
            placeholder="Who the official notice says qualifies."
            value={draft.eligibilityVerified}
            onChange={(e) =>
              onChange({ ...draft, eligibilityVerified: e.target.value })
            }
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`proof-verified-${id}`}>
            Proof (verified)
          </label>
          <select
            id={`proof-verified-${id}`}
            className="field-input"
            value={draft.proofVerified}
            onChange={(e) =>
              onChange({
                ...draft,
                proofVerified: e.target.value as VerifiedDraft['proofVerified'],
              })
            }
          >
            {PROOF_OPTIONS.map((opt) => (
              <option key={opt.value || 'unset'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`admin-verified-${id}`}>
            Administrator
          </label>
          <input
            id={`admin-verified-${id}`}
            className="field-input"
            value={draft.administrator}
            onChange={(e) =>
              onChange({ ...draft, administrator: e.target.value })
            }
          />
        </div>
        <div className="lg:col-span-2">
          <label className="field-label" htmlFor={`form-order-${id}`}>
            Official form field order
          </label>
          <input
            id={`form-order-${id}`}
            className="field-input"
            placeholder="full_name, email, phone, address_line1, address_line2, city, state"
            value={draft.formFieldOrder}
            onChange={(e) =>
              onChange({ ...draft, formFieldOrder: e.target.value })
            }
          />
          <p className="mt-1 text-xs text-ink-muted">
            Optional. Comma-separated packet fields in the official form&apos;s
            order. Leave blank for the default order.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onVerify}
          disabled={busy}
          className="btn-success px-3 py-1.5 text-sm"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BadgeCheck className="h-4 w-4" />
          )}
          Mark verified
        </button>
        {lawsuit.verified_at && (
          <button
            type="button"
            onClick={onUnverify}
            disabled={busy}
            className="btn-ghost px-3 py-1.5 text-sm text-ink-muted"
          >
            <ShieldOff className="h-4 w-4" />
            Clear verification
          </button>
        )}
      </div>
    </div>
  );
}
