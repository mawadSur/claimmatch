'use client';

import {
  MATCHER_QUESTIONS,
  SENSITIVE_OPTIONAL_QUESTIONS,
  type AttributeAnswers,
} from '@/lib/profile-attributes';
import type { EligibilityQuestion } from '@/lib/types';

/**
 * Short matcher questions (and an optional sensitive health section).
 * Used by onboarding and Settings so people can edit the same answers.
 */
export function ProfileAttributesFields({
  answers,
  onChange,
  idPrefix,
}: {
  answers: AttributeAnswers;
  onChange: (next: AttributeAnswers) => void;
  idPrefix: string;
}) {
  const ownsVehicle = answers.owns_vehicle === true;

  function setBoolean(key: string, value: boolean) {
    const next = { ...answers, [key]: value };
    if (key === 'owns_vehicle' && !value) next.vehicle_brands = [];
    onChange(next);
  }

  function toggleBrand(brand: string) {
    const current = Array.isArray(answers.vehicle_brands) ? answers.vehicle_brands : [];
    const next = current.includes(brand)
      ? current.filter((b) => b !== brand)
      : [...current, brand];
    onChange({ ...answers, owns_vehicle: true, vehicle_brands: next });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">Which of these sound like you?</legend>
        <p className="text-sm text-ink-muted">
          Check any that apply. You can skip a question or change this later in Settings.
        </p>
        {MATCHER_QUESTIONS.filter((q) => q.type === 'boolean').map((q) => (
          <BooleanRow
            key={q.key}
            id={`${idPrefix}-${q.key}`}
            question={q}
            value={answers[q.key] === true}
            onChange={(checked) => setBoolean(q.key, checked)}
          />
        ))}
        {ownsVehicle && (
          <BrandPicker
            idPrefix={idPrefix}
            selected={Array.isArray(answers.vehicle_brands) ? answers.vehicle_brands : []}
            onToggle={toggleBrand}
          />
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <legend className="px-1 text-sm font-semibold text-amber-950">
          Sensitive questions (optional)
        </legend>
        <p className="text-sm text-amber-950">
          These are about health or medication. They are optional. Skip them unless
          you want this stored. We do not use them to rank matches.
        </p>
        {SENSITIVE_OPTIONAL_QUESTIONS.map((q) => (
          <SensitiveRow
            key={q.key}
            id={`${idPrefix}-${q.key}`}
            question={q}
            value={typeof answers[q.key] === 'boolean' ? (answers[q.key] as boolean) : null}
            onChange={(value) => {
              const next = { ...answers };
              if (value === null) delete next[q.key];
              else next[q.key] = value;
              onChange(next);
            }}
          />
        ))}
      </fieldset>
    </div>
  );
}

function BooleanRow({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: EligibilityQuestion;
  value: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-ink">{question.label}</span>
        {question.help && <span className="mt-0.5 block text-xs text-ink-muted">{question.help}</span>}
      </span>
    </label>
  );
}

function BrandPicker({
  idPrefix,
  selected,
  onToggle,
}: {
  idPrefix: string;
  selected: string[];
  onToggle: (brand: string) => void;
}) {
  const brands =
    MATCHER_QUESTIONS.find((q) => q.key === 'vehicle_brands')?.options ?? [];
  return (
    <fieldset className="ml-7 space-y-2">
      <legend className="text-sm font-medium text-ink">Which brands?</legend>
      <div className="flex flex-wrap gap-2">
        {brands.map((brand) => {
          const id = `${idPrefix}-brand-${brand}`;
          const on = selected.includes(brand);
          return (
            <label
              key={brand}
              htmlFor={id}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-ink'
              }`}
            >
              <input
                id={id}
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                checked={on}
                onChange={() => onToggle(brand)}
              />
              {brand}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SensitiveRow({
  id,
  question,
  value,
  onChange,
}: {
  id: string;
  question: EligibilityQuestion;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div className="mt-4">
      <p id={`${id}-label`} className="text-sm font-medium text-amber-950">
        {question.label}
      </p>
      {question.help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-amber-950/80">
          {question.help}
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={question.help ? `${id}-help` : undefined}
        className="mt-3 flex flex-wrap gap-2"
      >
        {[
          { label: 'Yes', next: true as const },
          { label: 'No', next: false as const },
          { label: 'Skip', next: null },
        ].map((option) => {
          const selected = value === option.next;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.next)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${
                selected
                  ? 'bg-white text-amber-950 ring-amber-400'
                  : 'bg-transparent text-amber-950 ring-amber-200 hover:bg-white/70'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
