'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { US_STATES, cn } from '@/lib/utils';
import type { EligibilityQuestion } from '@/lib/types';

type AnswerValue = string | boolean | string[] | undefined;
type Answers = Record<string, AnswerValue>;

/**
 * Step-through onboarding questionnaire. Renders ELIGIBILITY_QUESTIONS one at a
 * time, collects answers keyed by question.key, then writes them to the user's
 * profile (state promoted to profiles.state, everything into attributes) and
 * kicks off match computation before sending the user to their dashboard.
 */
export function OnboardingWizard({
  questions,
}: {
  questions: EligibilityQuestion[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = questions.length;
  const current = questions[step];
  const isLast = step === total - 1;
  const progress = Math.round(((step + 1) / total) * 100);

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMulti(key: string, option: string) {
    setAnswers((prev) => {
      const arr = Array.isArray(prev[key]) ? [...(prev[key] as string[])] : [];
      const i = arr.indexOf(option);
      if (i === -1) arr.push(option);
      else arr.splice(i, 1);
      return { ...prev, [key]: arr };
    });
  }

  function goNext() {
    setError('');
    if (isLast) {
      void finish(answers);
      return;
    }
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function goBack() {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finish(collected: Answers) {
    setSubmitting(true);
    setError('');
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?next=/onboarding');
        return;
      }

      const state =
        typeof collected.state === 'string' ? collected.state : null;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ state, attributes: collected, onboarded: true })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message || 'Could not save your profile.');
        setSubmitting(false);
        return;
      }

      // Recompute matches; don't block the redirect if it fails — matches can
      // always be recomputed later from the dashboard.
      try {
        await fetch('/api/matches', { method: 'POST' });
      } catch {
        /* ignore */
      }

      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
      {/* Progress ---------------------------------------------------------- */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-medium text-ink-soft">
          <span>
            Question {step + 1} of {total}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question ---------------------------------------------------------- */}
      <fieldset className="min-h-[9rem]">
        <legend className="text-lg font-bold text-ink">{current.label}</legend>
        {current.help && (
          <p className="mt-1.5 text-sm text-ink-muted">{current.help}</p>
        )}

        <div className="mt-5">
          <QuestionField
            question={current}
            value={answers[current.key]}
            onSelect={(v) => setAnswer(current.key, v)}
            onToggleMulti={(opt) => toggleMulti(current.key, opt)}
          />
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Controls ---------------------------------------------------------- */}
      <div className="mt-7 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0 || submitting}
          className="btn-ghost disabled:invisible"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={submitting}
          className="btn-primary"
        >
          {submitting && isLast ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isLast ? (
            <>
              Finish setup <Check className="h-4 w-4" />
            </>
          ) : (
            <>
              Next <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Skip -------------------------------------------------------------- */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => finish(answers)}
          disabled={submitting}
          className="text-sm font-medium text-ink-soft hover:text-ink-muted disabled:opacity-50"
        >
          Skip for now — I’ll finish later
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function QuestionField({
  question,
  value,
  onSelect,
  onToggleMulti,
}: {
  question: EligibilityQuestion;
  value: AnswerValue;
  onSelect: (value: AnswerValue) => void;
  onToggleMulti: (option: string) => void;
}) {
  switch (question.type) {
    case 'state':
      return (
        <select
          aria-label={question.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onSelect(e.target.value || undefined)}
          className="field-input"
        >
          <option value="">Select your state…</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      );

    case 'select':
      return (
        <select
          aria-label={question.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onSelect(e.target.value || undefined)}
          className="field-input"
        >
          <option value="">Select one…</option>
          {(question.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <div role="group" aria-label={question.label} className="flex gap-3">
          {[
            { label: 'Yes', val: true },
            { label: 'No', val: false },
          ].map((opt) => {
            const selected = value === opt.val;
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(opt.val)}
                className={cn(
                  'flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                  selected
                    ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                    : 'border-gray-300 bg-white text-ink-muted hover:border-brand-200 hover:bg-brand-50/40',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );

    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div
          role="group"
          aria-label={question.label}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
        >
          {(question.options ?? []).map((opt) => {
            const selected = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleMulti(opt)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                  selected
                    ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                    : 'border-gray-300 bg-white text-ink-muted hover:border-brand-200 hover:bg-brand-50/40',
                )}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case 'date':
      return (
        <input
          type="date"
          aria-label={question.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onSelect(e.target.value || undefined)}
          className="field-input"
        />
      );

    case 'text':
    default:
      return (
        <input
          type="text"
          aria-label={question.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onSelect(e.target.value || undefined)}
          placeholder="Type your answer…"
          className="field-input"
        />
      );
  }
}
