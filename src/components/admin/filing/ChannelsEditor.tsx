'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { AgentChannel, BulkSource, ChannelConfig, ChannelConfigFor } from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { defaultChannelConfig, issuesAt, missingChannels, moveItem, nullIfBlank, parseEmails, removeItem, replaceItem } from './forms';
import { CHANNEL_LABEL } from './labels';
import { AreaField, CheckField, FieldIssues, IconButton, NumberField, SelectField, TextField } from './ui';

/** NumberField hands back undefined for a cleared box; NaN keeps it empty and the schema reports it. */
const num = (n: number | undefined) => n ?? Number.NaN;
const MB = 1024 * 1024;

type SourceKind = 'path' | 'signature' | 'claim' | 'constant';

const SOURCE_KIND_OPTIONS: ReadonlyArray<{ value: SourceKind; label: string }> = [
  { value: 'path', label: 'Packet field' },
  { value: 'signature', label: 'E-signature' },
  { value: 'claim', label: 'Claim' },
  { value: 'constant', label: 'Fixed text' },
];
const SIGNATURE_OPTIONS = [
  { value: 'typed_name', label: 'Typed name' },
  { value: 'signed_at', label: 'Signed at' },
  { value: 'packet_hash', label: 'Packet hash' },
  { value: 'signature_id', label: 'Signature id' },
] as const;
const CLAIM_OPTIONS = [
  { value: 'claim_id', label: 'Claim id' },
  { value: 'reference', label: 'Reference' },
] as const;

function sourceKind(source: BulkSource): SourceKind {
  if ('path' in source) return 'path';
  if ('signature' in source) return 'signature';
  if ('claim' in source) return 'claim';
  return 'constant';
}

function newSource(kind: SourceKind): BulkSource {
  if (kind === 'path') return { path: 'member.legal_name' };
  if (kind === 'signature') return { signature: 'typed_name' };
  if (kind === 'claim') return { claim: 'claim_id' };
  return { constant: '' };
}

function BulkColumns({
  idPrefix,
  config,
  onChange,
  disabled,
}: {
  idPrefix: string;
  config: ChannelConfigFor<'administrator_bulk'>;
  onChange: (config: ChannelConfigFor<'administrator_bulk'>) => void;
  disabled?: boolean;
}) {
  const columns = config.columns;
  const set = (i: number, column: (typeof columns)[number]) => onChange({ ...config, columns: replaceItem(columns, i, column) });
  return (
    <div className="space-y-2">
      <p className="field-label text-xs">Columns, in the administrator’s third-party-filer layout</p>
      {columns.map((column, i) => {
        const kind = sourceKind(column.source);
        const source = column.source;
        return (
          <div key={i} className="grid items-end gap-2 md:grid-cols-[1fr,10rem,1fr,auto]">
            <TextField id={`${idPrefix}-col-${i}-header`} label="Header" value={column.header} maxLength={120} disabled={disabled} onChange={(header) => set(i, { ...column, header })} />
            <SelectField id={`${idPrefix}-col-${i}-kind`} label="From" value={kind} options={SOURCE_KIND_OPTIONS} disabled={disabled} onChange={(k) => set(i, { ...column, source: newSource(k) })} />
            {'path' in source ? (
              <TextField id={`${idPrefix}-col-${i}-path`} label="Packet path" mono value={source.path} disabled={disabled} placeholder="member.address.zip" onChange={(path) => set(i, { ...column, source: { path } })} />
            ) : 'signature' in source ? (
              <SelectField id={`${idPrefix}-col-${i}-sig`} label="Value" value={source.signature} options={SIGNATURE_OPTIONS} disabled={disabled} onChange={(signature) => set(i, { ...column, source: { signature } })} />
            ) : 'claim' in source ? (
              <SelectField id={`${idPrefix}-col-${i}-claim`} label="Value" value={source.claim} options={CLAIM_OPTIONS} disabled={disabled} onChange={(claim) => set(i, { ...column, source: { claim } })} />
            ) : (
              <TextField id={`${idPrefix}-col-${i}-const`} label="Text" value={source.constant} maxLength={200} disabled={disabled} onChange={(constant) => set(i, { ...column, source: { constant } })} />
            )}
            <div className="flex gap-1">
              <IconButton label="Move column up" disabled={disabled || i === 0} onClick={() => onChange({ ...config, columns: moveItem(columns, i, -1) })}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Move column down" disabled={disabled || i === columns.length - 1} onClick={() => onChange({ ...config, columns: moveItem(columns, i, 1) })}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Remove column" disabled={disabled} onClick={() => onChange({ ...config, columns: removeItem(columns, i) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-sm"
        disabled={disabled}
        onClick={() => onChange({ ...config, columns: [...columns, { header: '', source: { path: 'member.legal_name' } }] })}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add a column
      </button>
      <p className="text-xs text-ink-muted">A CSV never carries documents. Cells that start with = + - @ get a leading apostrophe.</p>
    </div>
  );
}

function ChannelFields({
  idPrefix,
  config,
  onChange,
  disabled,
}: {
  idPrefix: string;
  config: ChannelConfig;
  onChange: (config: ChannelConfig) => void;
  disabled?: boolean;
}) {
  const [ccText, setCcText] = useState(config.type === 'administrator_email' ? config.cc.join(', ') : '');
  const cutoff = (
    <NumberField
      id={`${idPrefix}-min-days`}
      label="Cutoff: days before the deadline"
      value={config.min_days_before_deadline}
      min={1}
      max={60}
      disabled={disabled}
      hint="After this day the claim goes back to the member to self-file."
      onChange={(n) => onChange({ ...config, min_days_before_deadline: num(n) })}
    />
  );

  switch (config.type) {
    case 'filing_desk':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField id={`${idPrefix}-capacity`} label="Claims per day" value={config.daily_capacity} min={1} max={200} disabled={disabled} onChange={(n) => onChange({ ...config, daily_capacity: num(n) })} />
          <NumberField id={`${idPrefix}-sla`} label="SLA (business days)" value={config.sla_business_days} min={1} max={10} disabled={disabled} onChange={(n) => onChange({ ...config, sla_business_days: num(n) })} />
          {cutoff}
          <CheckField id={`${idPrefix}-docs`} label="Staff can attach the member’s proof documents" checked={config.accepts_documents} disabled={disabled} onChange={(accepts_documents) => onChange({ ...config, accepts_documents })} />
          <div className="md:col-span-3">
            <AreaField id={`${idPrefix}-instructions`} label="Desk instructions" value={config.instructions ?? ''} rows={3} disabled={disabled} onChange={(t) => onChange({ ...config, instructions: nullIfBlank(t) })} />
          </div>
        </div>
      );
    case 'administrator_email':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <TextField id={`${idPrefix}-to`} label="Administrator’s published claims address" type="email" value={config.to} disabled={disabled} onChange={(to) => onChange({ ...config, to })} />
          <TextField id={`${idPrefix}-published`} label="Where the administrator publishes it (https)" type="url" value={config.published_at_url} disabled={disabled} onChange={(published_at_url) => onChange({ ...config, published_at_url })} />
          <TextField
            id={`${idPrefix}-cc`}
            label="Copy to (up to 3, comma separated)"
            value={ccText}
            disabled={disabled}
            onChange={(text) => {
              setCcText(text);
              onChange({ ...config, cc: parseEmails(text) });
            }}
          />
          <TextField id={`${idPrefix}-subject`} label="Subject prefix" value={config.subject_prefix ?? ''} maxLength={120} disabled={disabled} onChange={(t) => onChange({ ...config, subject_prefix: nullIfBlank(t) })} />
          <NumberField
            id={`${idPrefix}-attach-max`}
            label="Attachments limit (MB)"
            value={config.max_total_attachment_bytes / MB}
            min={1}
            max={30}
            step="any"
            disabled={disabled}
            onChange={(n) => onChange({ ...config, max_total_attachment_bytes: n === undefined ? Number.NaN : Math.round(n * MB) })}
          />
          {cutoff}
          <CheckField id={`${idPrefix}-attach`} label="Attach the member’s stored documents" checked={config.attach_documents} disabled={disabled} onChange={(attach_documents) => onChange({ ...config, attach_documents })} />
        </div>
      );
    case 'administrator_bulk':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <TextField id={`${idPrefix}-prefix`} label="File name prefix" value={config.file_name_prefix} maxLength={40} disabled={disabled} onChange={(file_name_prefix) => onChange({ ...config, file_name_prefix })} />
            <NumberField id={`${idPrefix}-rows`} label="Rows per export" value={config.max_rows} min={1} max={5000} disabled={disabled} onChange={(n) => onChange({ ...config, max_rows: num(n) })} />
            {cutoff}
          </div>
          <BulkColumns idPrefix={idPrefix} config={config} disabled={disabled} onChange={onChange} />
        </div>
      );
    case 'administrator_api':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <TextField id={`${idPrefix}-adapter`} label="Adapter slug" mono value={config.adapter} maxLength={41} disabled={disabled} onChange={(adapter) => onChange({ ...config, adapter })} />
          {cutoff}
          <p className="text-xs text-ink-muted md:col-span-2">
            No administrator API adapter exists yet, so this channel cannot take claims. It is never chosen.
          </p>
        </div>
      );
  }
}

/** The policy's channels, in preference order: the first enabled one that can take a claim wins. */
export function ChannelsEditor({
  idPrefix,
  channels,
  onChange,
  disabled,
  issues,
}: {
  idPrefix: string;
  channels: readonly ChannelConfig[];
  onChange: (channels: ChannelConfig[]) => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
}) {
  const addable = missingChannels(channels);
  const [toAdd, setToAdd] = useState<AgentChannel | ''>('');
  const choice = toAdd && addable.includes(toAdd) ? toAdd : (addable[0] ?? '');

  return (
    <div className="space-y-3">
      {channels.length === 0 ? <p className="text-sm text-ink-muted">No channels: members finish on the official site.</p> : null}
      {channels.map((config, i) => (
        <div key={config.type} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-ink">{i + 1}. {CHANNEL_LABEL[config.type]}</span>
              <CheckField id={`${idPrefix}-${config.type}-enabled`} label="Enabled" checked={config.enabled} disabled={disabled} onChange={(enabled) => onChange(replaceItem(channels, i, { ...config, enabled }))} />
            </div>
            <div className="flex gap-1">
              <IconButton label="Move channel up" disabled={disabled || i === 0} onClick={() => onChange(moveItem(channels, i, -1))}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Move channel down" disabled={disabled || i === channels.length - 1} onClick={() => onChange(moveItem(channels, i, 1))}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Remove channel" disabled={disabled} onClick={() => onChange(removeItem(channels, i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
          </div>
          <ChannelFields idPrefix={`${idPrefix}-${config.type}`} config={config} disabled={disabled} onChange={(next) => onChange(replaceItem(channels, i, next))} />
          <FieldIssues issues={issuesAt(issues, `channels.${i}`)} />
        </div>
      ))}
      {addable.length > 0 && !disabled ? (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            id={`${idPrefix}-add`}
            label="Add a channel"
            value={choice}
            options={addable.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
            onChange={(c) => setToAdd(c)}
          />
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm"
            disabled={!choice}
            onClick={() => choice && onChange([...channels, defaultChannelConfig(choice)])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
