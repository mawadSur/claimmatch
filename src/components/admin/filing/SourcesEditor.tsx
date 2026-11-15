'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { SourceReviewed } from '@/lib/filing/v2/contract';
import { emptySource, issuesAt, nullIfBlank, removeItem, replaceItem, todayEastern } from './forms';
import { SOURCE_KIND_LABEL } from './labels';
import type { FieldIssue } from './api';
import { FieldIssues, IconButton, SelectField, TextField } from './ui';

const KIND_OPTIONS = (Object.keys(SOURCE_KIND_LABEL) as Array<SourceReviewed['kind']>).map((value) => ({
  value,
  label: SOURCE_KIND_LABEL[value],
}));

/** A list of documents the law firm reviewed (policy sources, and every approval's documents_reviewed). */
export function SourcesEditor({
  idPrefix,
  value,
  onChange,
  disabled,
  issues = [],
  pathPrefix,
  addLabel = 'Add a document',
}: {
  idPrefix: string;
  value: readonly SourceReviewed[];
  onChange: (value: SourceReviewed[]) => void;
  disabled?: boolean;
  issues?: readonly FieldIssue[];
  /** Where these sit in the validated object, e.g. "sources_reviewed". */
  pathPrefix: string;
  addLabel?: string;
}) {
  const set = (i: number, patch: Partial<SourceReviewed>) => onChange(replaceItem(value, i, { ...value[i], ...patch }));

  return (
    <div className="space-y-3">
      {value.length === 0 ? <p className="text-xs text-ink-muted">None listed.</p> : null}
      {value.map((source, i) => (
        <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="grid gap-3 md:grid-cols-[12rem,1fr,auto]">
            <SelectField
              id={`${idPrefix}-kind-${i}`}
              label="Kind"
              value={source.kind}
              options={KIND_OPTIONS}
              disabled={disabled}
              onChange={(kind) => set(i, { kind })}
            />
            <TextField
              id={`${idPrefix}-title-${i}`}
              label="Title"
              value={source.title}
              maxLength={300}
              disabled={disabled}
              onChange={(title) => set(i, { title })}
            />
            <div className="flex items-end">
              <IconButton label="Remove this document" disabled={disabled} onClick={() => onChange(removeItem(value, i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <TextField
              id={`${idPrefix}-url-${i}`}
              label="Link (https)"
              type="url"
              value={source.url ?? ''}
              disabled={disabled}
              onChange={(url) => set(i, { url: nullIfBlank(url) })}
            />
            <TextField
              id={`${idPrefix}-ref-${i}`}
              label="File reference (no public link)"
              value={source.document_ref ?? ''}
              maxLength={300}
              disabled={disabled}
              onChange={(ref) => set(i, { document_ref: nullIfBlank(ref) })}
            />
            <TextField
              id={`${idPrefix}-date-${i}`}
              label="Reviewed on"
              type="date"
              value={source.reviewed_on}
              disabled={disabled}
              onChange={(reviewed_on) => set(i, { reviewed_on })}
            />
          </div>
          <div className="mt-3">
            <TextField
              id={`${idPrefix}-notes-${i}`}
              label="Notes"
              value={source.notes ?? ''}
              maxLength={2000}
              disabled={disabled}
              onChange={(notes) => set(i, { notes: nullIfBlank(notes) })}
            />
          </div>
          <FieldIssues issues={issuesAt(issues, `${pathPrefix}.${i}`)} />
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-sm"
        disabled={disabled}
        onClick={() => onChange([...value, emptySource(todayEastern())])}
      >
        <Plus className="h-4 w-4" aria-hidden /> {addLabel}
      </button>
    </div>
  );
}
