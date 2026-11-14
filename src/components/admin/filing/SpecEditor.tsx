'use client';

import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  MEMBER_FIELDS,
  OFFICIAL_FORM_CHALLENGES,
  type FilingSpecContent,
  type MemberField,
} from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { FieldOrderEditor } from './FieldOrderEditor';
import { issuesAt, nullIfBlank, removeItem, replaceItem } from './forms';
import { JevRulesEditor } from './JsonFields';
import { CHALLENGE_LABEL, MEMBER_FIELD_LABEL } from './labels';
import { SpecQuestionsEditor } from './SpecQuestionsEditor';
import { SpecTiersEditor } from './SpecTiersEditor';
import { AreaField, CheckField, FieldIssues, IconButton, SelectField, TextField } from './ui';

const DEADLINE_TYPES = [
  { value: 'submit_online_by', label: 'Submit online by' },
  { value: 'postmark_by', label: 'Postmarked by' },
  { value: 'received_by', label: 'Received by' },
] as const;

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-100 p-4">
      <legend className="px-1 text-sm font-bold text-ink">{title}</legend>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function MemberFieldsEditor({
  idPrefix,
  spec,
  onChange,
  disabled,
}: {
  idPrefix: string;
  spec: FilingSpecContent;
  onChange: (fields: FilingSpecContent['member_fields']) => void;
  disabled?: boolean;
}) {
  const byField = new Map(spec.member_fields.map((m) => [m.field, m]));
  const toggle = (field: MemberField, on: boolean) => {
    const next = on
      ? [...spec.member_fields, { field, official_label: '', required: field === 'legal_name' }]
      : spec.member_fields.filter((m) => m.field !== field);
    onChange(next);
  };
  const patch = (field: MemberField, change: Partial<FilingSpecContent['member_fields'][number]>) =>
    onChange(spec.member_fields.map((m) => (m.field === field ? { ...m, ...change } : m)));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-2 py-1">On the form</th>
            <th className="px-2 py-1">Field</th>
            <th className="px-2 py-1">Official label</th>
            <th className="px-2 py-1">Required</th>
          </tr>
        </thead>
        <tbody>
          {MEMBER_FIELDS.map((field) => {
            const row = byField.get(field);
            const fixed = field === 'legal_name';
            return (
              <tr key={field} className="align-top">
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    aria-label={`${MEMBER_FIELD_LABEL[field]} is on the form`}
                    className="mt-2 h-4 w-4"
                    checked={Boolean(row)}
                    disabled={disabled || fixed}
                    onChange={(e) => toggle(field, e.target.checked)}
                  />
                </td>
                <td className="px-2 py-1 pt-2 text-ink">{MEMBER_FIELD_LABEL[field]}</td>
                <td className="px-2 py-1">
                  {row ? (
                    <input
                      aria-label={`Official label for ${MEMBER_FIELD_LABEL[field]}`}
                      id={`${idPrefix}-${field}-label`}
                      className="field-input py-1.5 text-sm"
                      value={row.official_label}
                      maxLength={300}
                      disabled={disabled}
                      onChange={(e) => patch(field, { official_label: e.target.value })}
                    />
                  ) : null}
                </td>
                <td className="px-2 py-1">
                  {row ? (
                    <input
                      type="checkbox"
                      aria-label={`${MEMBER_FIELD_LABEL[field]} is required`}
                      className="mt-2 h-4 w-4"
                      checked={row.required}
                      disabled={disabled || fixed}
                      onChange={(e) => patch(field, { required: e.target.checked })}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The filing spec: the official form, word for word. Every label is the
 * form's own wording; specs can never ask for PINs, codes, passwords, SSNs,
 * account numbers or payout details (the contract schema refuses them).
 */
export function SpecEditor({
  idPrefix,
  value,
  onChange,
  onRulesValidity,
  disabled,
  issues,
  ruleIssues,
}: {
  idPrefix: string;
  value: FilingSpecContent;
  onChange: (value: FilingSpecContent) => void;
  onRulesValidity: (ok: boolean) => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
  /** validateJevRules errors from the server check. */
  ruleIssues: readonly FieldIssue[];
}) {
  const set = (patch: Partial<FilingSpecContent>) => onChange({ ...value, ...patch });
  const tierKeys = value.benefit_tiers.map((t) => t.key);

  return (
    <div className="space-y-4">
      <Section title="Official form" hint="Staff open this link in their own browser. A known check on the form keeps the filing desk off.">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField id={`${idPrefix}-url`} label="Official claim form (https)" type="url" value={value.official_form.url} disabled={disabled} onChange={(url) => set({ official_form: { ...value.official_form, url } })} />
          <TextField id={`${idPrefix}-form-title`} label="Form title (optional)" value={value.official_form.title ?? ''} maxLength={300} disabled={disabled} onChange={(t) => set({ official_form: { ...value.official_form, title: nullIfBlank(t) } })} />
        </div>
        <div className="flex flex-wrap gap-4">
          {OFFICIAL_FORM_CHALLENGES.map((c) => (
            <CheckField
              key={c}
              id={`${idPrefix}-challenge-${c}`}
              label={`Shows: ${CHALLENGE_LABEL[c]}`}
              checked={value.official_form.challenges.includes(c)}
              disabled={disabled}
              onChange={(on) =>
                set({
                  official_form: {
                    ...value.official_form,
                    challenges: on
                      ? OFFICIAL_FORM_CHALLENGES.filter((x) => x === c || value.official_form.challenges.includes(x))
                      : value.official_form.challenges.filter((x) => x !== c),
                  },
                })
              }
            />
          ))}
        </div>
        <FieldIssues issues={issuesAt(issues, 'official_form')} />
      </Section>

      <Section title="Deadline">
        <CheckField
          id={`${idPrefix}-has-deadline`}
          label="The official form states a deadline"
          checked={value.deadline !== null}
          disabled={disabled}
          onChange={(on) => set({ deadline: on ? { date: '', time_zone: 'America/New_York', type: 'submit_online_by' } : null })}
        />
        {value.deadline ? (
          <div className="grid gap-3 md:grid-cols-3">
            <TextField id={`${idPrefix}-deadline-date`} label="Date" type="date" value={value.deadline.date} disabled={disabled} onChange={(date) => value.deadline && set({ deadline: { ...value.deadline, date } })} />
            <TextField id={`${idPrefix}-deadline-zone`} label="Time zone" value={value.deadline.time_zone} maxLength={64} disabled={disabled} onChange={(time_zone) => value.deadline && set({ deadline: { ...value.deadline, time_zone } })} />
            <SelectField id={`${idPrefix}-deadline-type`} label="Kind" value={value.deadline.type} options={DEADLINE_TYPES} disabled={disabled} onChange={(type) => value.deadline && set({ deadline: { ...value.deadline, type } })} />
          </div>
        ) : null}
        <FieldIssues issues={issuesAt(issues, 'deadline')} />
      </Section>

      <Section title="Class definition (verbatim)" hint="Shown to the member word for word; they tick “This describes me” themselves.">
        <AreaField id={`${idPrefix}-class-text`} label="Text" value={value.class_definition.text} rows={5} disabled={disabled} onChange={(text) => set({ class_definition: { ...value.class_definition, text } })} />
        <TextField id={`${idPrefix}-class-source`} label="Source (https)" type="url" value={value.class_definition.source_url} disabled={disabled} onChange={(source_url) => set({ class_definition: { ...value.class_definition, source_url } })} />
        <FieldIssues issues={issuesAt(issues, 'class_definition')} />
      </Section>

      <Section title="Sworn statement (verbatim)" hint="The member reads it word for word, ticks it and types their full legal name. Never pre-ticked or typed for them.">
        <AreaField id={`${idPrefix}-attestation`} label="Text" value={value.attestation.text} rows={5} disabled={disabled} onChange={(text) => set({ attestation: { ...value.attestation, text } })} />
        <TextField id={`${idPrefix}-attestation-source`} label="Source (https, optional)" type="url" value={value.attestation.source_url ?? ''} disabled={disabled} onChange={(u) => set({ attestation: { ...value.attestation, source_url: nullIfBlank(u) } })} />
        <CheckField
          id={`${idPrefix}-agent-cert`}
          label="The form makes the submitter certify facts"
          checked={value.requires_agent_certification}
          disabled={disabled}
          onChange={(requires_agent_certification) => set({ requires_agent_certification })}
          hint="Agent lanes then stay off unless the policy allows agent certification."
        />
        <FieldIssues issues={[...issuesAt(issues, 'attestation'), ...issuesAt(issues, 'requires_agent_certification')]} />
      </Section>

      <Section title="Member details on the form" hint="Prefilled from the member’s profile; asked once when missing. Full legal name is always required.">
        <MemberFieldsEditor idPrefix={`${idPrefix}-member`} spec={value} disabled={disabled} onChange={(member_fields) => set({ member_fields })} />
        <FieldIssues issues={issuesAt(issues, 'member_fields')} />
      </Section>

      <Section title="Settlement questions">
        <SpecQuestionsEditor idPrefix={`${idPrefix}-q`} questions={value.questions} tierKeys={tierKeys} disabled={disabled} issues={issues} onChange={(questions) => set({ questions })} />
        <FieldIssues issues={issues.filter((i) => i.path === 'questions')} />
      </Section>

      <Section title="Benefit tiers and proof">
        <SpecTiersEditor idPrefix={`${idPrefix}-tiers`} tiers={value.benefit_tiers} disabled={disabled} issues={issues} onChange={(benefit_tiers) => set({ benefit_tiers })} />
        <FieldIssues issues={issues.filter((i) => i.path === 'benefit_tiers')} />
      </Section>

      <Section title="Payout options" hint="Method names only (check, PayPal…). Payment always goes to the member; account details stay with the administrator.">
        {value.payout_options.map((option, i) => (
          <div key={i} className="grid items-end gap-2 md:grid-cols-[12rem,1fr,auto]">
            <TextField id={`${idPrefix}-payout-${i}-value`} label="Value" mono value={option.value} maxLength={64} disabled={disabled} onChange={(v) => set({ payout_options: replaceItem(value.payout_options, i, { ...option, value: v }) })} />
            <TextField id={`${idPrefix}-payout-${i}-label`} label="Official label" value={option.official_label} maxLength={300} disabled={disabled} onChange={(l) => set({ payout_options: replaceItem(value.payout_options, i, { ...option, official_label: l }) })} />
            <IconButton label="Remove payout option" disabled={disabled} onClick={() => set({ payout_options: removeItem(value.payout_options, i) })}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-sm"
          disabled={disabled || value.payout_options.length >= 10}
          onClick={() => set({ payout_options: [...value.payout_options, { value: `method_${value.payout_options.length + 1}`, official_label: '' }] })}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a payout option
        </button>
        <FieldIssues issues={issuesAt(issues, 'payout_options')} />
      </Section>

      <Section title="Official form field order">
        <FieldOrderEditor idPrefix={`${idPrefix}-order`} spec={value} disabled={disabled} issues={issues} onChange={(form_field_order) => set({ form_field_order })} />
      </Section>

      <Section title="Jev rules">
        <JevRulesEditor
          id={`${idPrefix}-jev`}
          value={value.jev_rules}
          disabled={disabled}
          serverIssues={ruleIssues}
          onValidity={onRulesValidity}
          onChange={(jev_rules) => set({ jev_rules })}
        />
      </Section>

      <Section title="Desk notes" hint="Shown on the filing desk with every claim on this spec.">
        <AreaField id={`${idPrefix}-desk-notes`} label="Notes" value={value.desk_notes ?? ''} rows={3} disabled={disabled} onChange={(t) => set({ desk_notes: nullIfBlank(t) })} />
      </Section>
    </div>
  );
}
