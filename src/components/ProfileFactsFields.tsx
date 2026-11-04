'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ProfileFact, ProfileFactType } from '@/lib/types';
import { PROFILE_FACT_LABELS, PROFILE_FACT_TYPES } from '@/lib/profile-facts';

export type DraftFact = {
  key: string;
  type: ProfileFactType;
  value: string;
  start_date: string;
  end_date: string;
};

let draftKey = 0;
export function newDraftFact(partial: Partial<DraftFact> = {}): DraftFact {
  draftKey += 1;
  return {
    key: `fact-${draftKey}`,
    type: 'purchase',
    value: '',
    start_date: '',
    end_date: '',
    ...partial,
  };
}

export function draftsFromFacts(facts: ProfileFact[] | null | undefined): DraftFact[] {
  if (!facts?.length) return [newDraftFact()];
  return facts.map((fact) =>
    newDraftFact({
      type: fact.type,
      value: fact.value,
      start_date: fact.start_date ?? '',
      end_date: fact.end_date ?? '',
    }),
  );
}

export function draftsToPayload(drafts: DraftFact[]) {
  return drafts
    .filter((row) => row.value.trim())
    .map((row) => ({
      type: row.type,
      value: row.value.trim(),
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      source: 'user',
    }));
}

export function ProfileFactsFields({
  drafts,
  onChange,
  idPrefix = 'facts',
}: {
  drafts: DraftFact[];
  onChange: (next: DraftFact[]) => void;
  idPrefix?: string;
}) {
  function update(index: number, patch: Partial<DraftFact>) {
    onChange(drafts.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Optional. Brands you bought, accounts you used, employers, or places you
        lived — with dates if you remember them. We use these to find settlements
        that may apply. You can skip any row.
      </p>
      {drafts.map((row, index) => (
        <fieldset
          key={row.key}
          className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"
        >
          <legend className="sr-only">Profile fact {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor={`${idPrefix}-type-${index}`}>
                Type
              </label>
              <select
                id={`${idPrefix}-type-${index}`}
                className="field-input"
                value={row.type}
                onChange={(e) => update(index, { type: e.target.value as ProfileFactType })}
              >
                {PROFILE_FACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROFILE_FACT_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor={`${idPrefix}-value-${index}`}>
                Name
              </label>
              <input
                id={`${idPrefix}-value-${index}`}
                className="field-input"
                value={row.value}
                maxLength={200}
                placeholder={
                  row.type === 'employer'
                    ? 'Employer name'
                    : row.type === 'location'
                      ? 'State or city'
                      : 'Brand or product'
                }
                onChange={(e) => update(index, { value: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor={`${idPrefix}-start-${index}`}>
                Start date (optional)
              </label>
              <input
                id={`${idPrefix}-start-${index}`}
                type="date"
                className="field-input"
                value={row.start_date}
                onChange={(e) => update(index, { start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor={`${idPrefix}-end-${index}`}>
                End date (optional)
              </label>
              <input
                id={`${idPrefix}-end-${index}`}
                type="date"
                className="field-input"
                value={row.end_date}
                onChange={(e) => update(index, { end_date: e.target.value })}
              />
            </div>
          </div>
          {drafts.length > 1 && (
            <button
              type="button"
              className="btn-ghost mt-3 !px-2 !py-1 text-sm text-ink-muted"
              onClick={() => onChange(drafts.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </button>
          )}
        </fieldset>
      ))}
      {drafts.length < 20 && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange([...drafts, newDraftFact()])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add another
        </button>
      )}
    </div>
  );
}
