'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from 'lucide-react';
import type { FilingSpecContent } from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { completeFieldOrder, issuesAt, moveItem, removeItem, specPacketPaths } from './forms';
import { FieldIssues, IconButton } from './ui';

/**
 * The official form's field order. The desk screen, the administrator email
 * and the member's review all follow it.
 */
export function FieldOrderEditor({
  idPrefix,
  spec,
  onChange,
  disabled,
  issues,
}: {
  idPrefix: string;
  spec: FilingSpecContent;
  onChange: (order: string[]) => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
}) {
  const available = specPacketPaths(spec);
  const labels = new Map(available.map((p) => [p.path, p.label]));
  const order = spec.form_field_order;
  const placed = new Set(order);
  const unplaced = available.filter((p) => !placed.has(p.path));
  const [toAdd, setToAdd] = useState('');
  const choice = unplaced.some((p) => p.path === toAdd) ? toAdd : (unplaced[0]?.path ?? '');

  return (
    <div className="space-y-3">
      {order.length === 0 ? (
        <p className="text-sm text-ink-muted">No order yet: add the fields in the order the official form asks for them.</p>
      ) : (
        <ol className="space-y-1">
          {order.map((path, i) => (
            <li key={path} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-1.5">
              <span className="min-w-0 text-sm">
                <span className="mr-2 tabular-nums text-ink-muted">{i + 1}.</span>
                {labels.get(path) ?? <span className="text-danger-700">Not in this spec</span>}
                <span className="ml-2 font-mono text-xs text-ink-muted">{path}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <IconButton label={`Move ${path} up`} disabled={disabled || i === 0} onClick={() => onChange(moveItem(order, i, -1))}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label={`Move ${path} down`} disabled={disabled || i === order.length - 1} onClick={() => onChange(moveItem(order, i, 1))}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label={`Remove ${path}`} disabled={disabled} onClick={() => onChange(removeItem(order, i))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </span>
            </li>
          ))}
        </ol>
      )}
      {unplaced.length > 0 && !disabled ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label text-xs" htmlFor={`${idPrefix}-add`}>Not placed yet ({unplaced.length})</label>
            <select id={`${idPrefix}-add`} className="field-input py-2 text-sm" value={choice} onChange={(e) => setToAdd(e.target.value)}>
              {unplaced.map((p) => (
                <option key={p.path} value={p.path}>{p.label} ({p.path})</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-ghost px-3 py-2 text-sm" disabled={!choice} onClick={() => choice && onChange([...order, choice])}>
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={() => onChange(completeFieldOrder(spec))}>
            <ListOrdered className="h-4 w-4" aria-hidden /> Add all the rest
          </button>
        </div>
      ) : null}
      <FieldIssues issues={issuesAt(issues, 'form_field_order')} />
    </div>
  );
}
