'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { QUESTION_TYPES, type SpecQuestion } from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { isChoice, issuesAt, moveItem, newQuestion, nullIfBlank, removeItem, replaceItem, withQuestionType } from './forms';
import { ConditionField } from './JsonFields';
import { QUESTION_TYPE_LABEL } from './labels';
import { AreaField, CheckField, FieldIssues, IconButton, NumberField, SelectField, TextField } from './ui';

const TYPE_OPTIONS = QUESTION_TYPES.map((value) => ({ value, label: QUESTION_TYPE_LABEL[value] }));

type Validation = NonNullable<SpecQuestion['validation']>;

/** Merges a validation change; an all-empty validation becomes null. */
export function withValidation(question: SpecQuestion, patch: Partial<Validation>): SpecQuestion {
  const merged: Validation = { ...(question.validation ?? {}), ...patch };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))),
  ) as Validation;
  return { ...question, validation: Object.keys(clean).length > 0 ? clean : null };
}

function QuestionCard({
  idPrefix,
  index,
  count,
  question,
  tierKeys,
  onChange,
  onMove,
  onRemove,
  disabled,
  issues,
}: {
  idPrefix: string;
  index: number;
  count: number;
  question: SpecQuestion;
  tierKeys: readonly string[];
  onChange: (q: SpecQuestion) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
}) {
  const id = `${idPrefix}-${index}`;
  const v = question.validation ?? {};
  const options = question.options ?? [];
  const setOptions = (next: NonNullable<SpecQuestion['options']>) => onChange({ ...question, options: next });

  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">Question {index + 1}</span>
        <div className="flex gap-1">
          <IconButton label="Move question up" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Move question down" disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Remove question" disabled={disabled} onClick={onRemove}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <TextField id={`${id}-key`} label="Key" mono value={question.key} maxLength={64} disabled={disabled} onChange={(key) => onChange({ ...question, key })} />
        <SelectField id={`${id}-type`} label="Type" value={question.type} options={TYPE_OPTIONS} disabled={disabled} onChange={(type) => onChange(withQuestionType(question, type))} />
        <div className="flex flex-col justify-end gap-2">
          <CheckField id={`${id}-required`} label="Required" checked={question.required} disabled={disabled} onChange={(required) => onChange({ ...question, required })} />
          <CheckField id={`${id}-health`} label="Health data" checked={question.health_flag} disabled={disabled} onChange={(health_flag) => onChange({ ...question, health_flag })} />
        </div>
      </div>
      <AreaField
        id={`${id}-label`}
        label="Official label (the form’s wording, verbatim)"
        value={question.official_label}
        rows={2}
        disabled={disabled}
        onChange={(official_label) => onChange({ ...question, official_label })}
      />
      <AreaField
        id={`${id}-help`}
        label="Plain-English help (optional; never replaces the official label)"
        value={question.help ?? ''}
        rows={2}
        disabled={disabled}
        onChange={(help) => onChange({ ...question, help: nullIfBlank(help) })}
      />

      {isChoice(question.type) ? (
        <div className="space-y-2">
          <p className="field-label text-xs">Options (value and the form’s label)</p>
          {options.map((option, j) => (
            <div key={j} className="grid items-end gap-2 md:grid-cols-[12rem,1fr,auto]">
              <TextField id={`${id}-opt-${j}-value`} label="Value" mono value={option.value} maxLength={64} disabled={disabled} onChange={(value) => setOptions(replaceItem(options, j, { ...option, value }))} />
              <TextField id={`${id}-opt-${j}-label`} label="Official label" value={option.official_label} maxLength={300} disabled={disabled} onChange={(official_label) => setOptions(replaceItem(options, j, { ...option, official_label }))} />
              <div className="flex gap-1">
                <IconButton label="Move option up" disabled={disabled || j === 0} onClick={() => setOptions(moveItem(options, j, -1))}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Remove option" disabled={disabled || options.length <= 1} onClick={() => setOptions(removeItem(options, j))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            disabled={disabled}
            onClick={() => setOptions([...options, { value: `option_${options.length + 1}`, official_label: '' }])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add an option
          </button>
        </div>
      ) : null}

      <details className="rounded-lg border border-gray-100 bg-white p-2">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          Validation {question.validation ? '(set)' : '(optional)'}
        </summary>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <NumberField id={`${id}-min`} label="Minimum" value={v.min} step="any" disabled={disabled} onChange={(min) => onChange(withValidation(question, { min }))} />
          <NumberField id={`${id}-max`} label="Maximum" value={v.max} step="any" disabled={disabled} onChange={(max) => onChange(withValidation(question, { max }))} />
          <NumberField id={`${id}-minlen`} label="Shortest length" value={v.min_length} min={0} max={2000} disabled={disabled} onChange={(min_length) => onChange(withValidation(question, { min_length }))} />
          <NumberField id={`${id}-maxlen`} label="Longest length" value={v.max_length} min={1} max={2000} disabled={disabled} onChange={(max_length) => onChange(withValidation(question, { max_length }))} />
          <TextField id={`${id}-pattern`} label="Pattern (regular expression)" mono value={v.pattern ?? ''} maxLength={200} disabled={disabled} onChange={(pattern) => onChange(withValidation(question, { pattern: pattern || undefined }))} />
          <TextField id={`${id}-pattern-hint`} label="Pattern hint for the member" value={v.pattern_hint ?? ''} maxLength={200} disabled={disabled} onChange={(pattern_hint) => onChange(withValidation(question, { pattern_hint: pattern_hint || undefined }))} />
        </div>
      </details>

      {tierKeys.length > 0 ? (
        <fieldset>
          <legend className="field-label text-xs">Asked for these benefit tiers (none ticked: every tier)</legend>
          <div className="flex flex-wrap gap-3">
            {tierKeys.map((tier) => {
              const on = question.tiers?.includes(tier) ?? false;
              return (
                <CheckField
                  key={tier}
                  id={`${id}-tier-${tier}`}
                  label={<span className="font-mono text-xs">{tier}</span>}
                  checked={on}
                  disabled={disabled}
                  onChange={(checked) => {
                    const next = checked ? [...(question.tiers ?? []), tier] : (question.tiers ?? []).filter((t) => t !== tier);
                    onChange({ ...question, tiers: next.length > 0 ? next : null });
                  }}
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <ConditionField id={`${id}-visible`} value={question.visible_when} disabled={disabled} onChange={(visible_when) => onChange({ ...question, visible_when })} />
      <FieldIssues issues={issues} />
    </div>
  );
}

/** The settlement's own questions, in the official form's wording. */
export function SpecQuestionsEditor({
  idPrefix,
  questions,
  tierKeys,
  onChange,
  disabled,
  issues,
}: {
  idPrefix: string;
  questions: readonly SpecQuestion[];
  tierKeys: readonly string[];
  onChange: (questions: SpecQuestion[]) => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
}) {
  return (
    <div className="space-y-3">
      {questions.length === 0 ? <p className="text-sm text-ink-muted">No settlement questions yet.</p> : null}
      {questions.map((question, i) => (
        <QuestionCard
          key={i}
          idPrefix={idPrefix}
          index={i}
          count={questions.length}
          question={question}
          tierKeys={tierKeys}
          disabled={disabled}
          issues={issuesAt(issues, `questions.${i}`)}
          onChange={(q) => onChange(replaceItem(questions, i, q))}
          onMove={(delta) => onChange(moveItem(questions, i, delta))}
          onRemove={() => onChange(removeItem(questions, i))}
        />
      ))}
      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-sm"
        disabled={disabled || questions.length >= 60}
        onClick={() => onChange([...questions, newQuestion(questions)])}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add a question
      </button>
    </div>
  );
}
