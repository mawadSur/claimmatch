'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AGENT_FILING_VALUES, type FilingPolicyContent } from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { ChannelsEditor } from './ChannelsEditor';
import { issuesAt, nullIfBlank, parseStates } from './forms';
import { AGENT_FILING_LABEL } from './labels';
import { SourcesEditor } from './SourcesEditor';
import { AreaField, CheckField, FieldIssues, Notice, SelectField, TextField } from './ui';

const AGENT_FILING_OPTIONS = AGENT_FILING_VALUES.map((value) => ({ value, label: AGENT_FILING_LABEL[value] }));

/**
 * The editable parts of a filing policy version (FilingPolicyContentSchema).
 * Saving makes a draft; nothing here takes effect until a legal reviewer
 * approves the version. Remount (key) to reset it from a stored version.
 */
export function PolicyEditor({
  idPrefix,
  value,
  onChange,
  disabled,
  administratorLevel,
  issues,
}: {
  idPrefix: string;
  value: FilingPolicyContent;
  onChange: (value: FilingPolicyContent) => void;
  disabled?: boolean;
  /** An administrator-level policy only restricts; its channels are never used. */
  administratorLevel: boolean;
  issues: readonly FieldIssue[];
}) {
  const [statesText, setStatesText] = useState((value.allowed_states ?? []).join(', '));
  const set = (patch: Partial<FilingPolicyContent>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SelectField
            id={`${idPrefix}-agent-filing`}
            label="Agent filing"
            value={value.agent_filing}
            options={AGENT_FILING_OPTIONS}
            disabled={disabled}
            onChange={(agent_filing) => set({ agent_filing })}
            hint="Unknown (the default) sends every member to the official site. Silence or generic “authorized representative” wording is not permission."
          />
          <FieldIssues issues={issuesAt(issues, 'agent_filing')} />
        </div>
        <div>
          <TextField
            id={`${idPrefix}-states`}
            label="States the law firm covers"
            value={statesText}
            placeholder="CA, NY, TX"
            disabled={disabled}
            onChange={(text) => {
              setStatesText(text);
              set({ allowed_states: parseStates(text) });
            }}
            hint={
              administratorLevel
                ? 'Optional here: intersected with the settlement policy’s list.'
                : 'Two-letter codes. Required when agent filing is allowed; empty means no restriction at this level.'
            }
          />
          <FieldIssues issues={issuesAt(issues, 'allowed_states')} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CheckField
          id={`${idPrefix}-cert`}
          label="Allow agent certification"
          checked={value.agent_certification_allowed}
          disabled={disabled}
          onChange={(agent_certification_allowed) => set({ agent_certification_allowed })}
          hint="Some official forms make the submitter swear to facts (Kroger, Raging Waters). Leave off unless the law firm allows it for this form."
        />
        <CheckField
          id={`${idPrefix}-identity`}
          label="Identity check required"
          checked={value.identity_check_required}
          disabled={disabled}
          onChange={(identity_check_required) => set({ identity_check_required })}
          hint="No identity vendor exists yet: while this is on, every agent channel stays off for this settlement."
        />
      </div>

      <div className="space-y-3">
        <CheckField
          id={`${idPrefix}-health`}
          label="Health-sensitive settlement"
          checked={value.health_sensitive}
          disabled={disabled}
          onChange={(health_sensitive) => set({ health_sensitive })}
          hint="Flagged health answers and documents are never collected without the law firm’s consent text below and the member’s own consent (Washington My Health My Data Act)."
        />
        <AreaField
          id={`${idPrefix}-health-text`}
          label="Health consent text (the law firm’s wording, shown to the member verbatim)"
          value={value.health_consent_text ?? ''}
          rows={4}
          disabled={disabled}
          onChange={(text) => set({ health_consent_text: nullIfBlank(text) })}
        />
        <FieldIssues issues={issuesAt(issues, 'health_consent_text')} />
      </div>

      <div>
        <h4 className="text-sm font-bold text-ink">Channels</h4>
        {administratorLevel ? (
          <p className="mt-1 text-sm text-ink-muted">
            Channels and their settings come only from each settlement’s own policy. This level can only restrict.
          </p>
        ) : (
          <>
            <p className="mb-3 mt-1 text-sm text-ink-muted">
              In preference order. A channel works only after a legal reviewer approves this policy version.
            </p>
            <ChannelsEditor
              idPrefix={`${idPrefix}-channels`}
              channels={value.channels}
              disabled={disabled}
              issues={issues}
              onChange={(channels) => set({ channels })}
            />
            <FieldIssues issues={issues.filter((i) => i.path === 'channels')} />
          </>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold text-ink">Sources reviewed</h4>
        <p className="mb-3 mt-1 text-sm text-ink-muted">
          The agreement, orders, notice, claim form, administrator letters and site terms this policy rests on.
        </p>
        <SourcesEditor
          idPrefix={`${idPrefix}-sources`}
          value={value.sources_reviewed}
          disabled={disabled}
          issues={issues}
          pathPrefix="sources_reviewed"
          onChange={(sources_reviewed) => set({ sources_reviewed })}
        />
      </div>

      <AreaField
        id={`${idPrefix}-notes`}
        label="Notes"
        value={value.notes ?? ''}
        rows={4}
        disabled={disabled}
        onChange={(text) => set({ notes: nullIfBlank(text) })}
      />

      <Notice tone="info">
        Fee status (third-party fee: unknown, allowed or barred) is set for each settlement in the{' '}
        <Link href="/admin/catalog" className="text-link">Catalog</Link>. This build charges no fee, and every
        payment goes to the member.
      </Notice>
    </div>
  );
}
