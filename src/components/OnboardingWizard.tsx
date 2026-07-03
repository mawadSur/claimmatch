'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
  PartyPopper,
  Sparkles,
  Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { US_STATES, cn } from '@/lib/utils';
import { formatUSD } from '@/lib/recovery';
import type { EligibilityQuestion } from '@/lib/types';

type AnswerValue = string | boolean | string[] | undefined;
type Answers = Record<string, AnswerValue>;

interface Reveal {
  count: number;
  totalOwed: number;
}

/**
 * Step-through onboarding questionnaire. Renders ELIGIBILITY_QUESTIONS one at a
 * time, collects answers keyed by question.key, saves them to the profile, then
 * recomputes matches and reveals the estimated total the user is owed before
 * sending them to their dashboard.
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
  const [reveal, setReveal] = useState<Reveal | null>(null);

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

  /**
   * Persist the profile (state promoted to a column, everything into
   * attributes) and mark it onboarded. Returns true on success.
   */
  async function saveProfile(collected: Answers): Promise<boolean> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login?next=/onboarding');
      return false;
    }

    const state = typeof collected.state === 'string' ? collected.state : null;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ state, attributes: collected, onboarded: true })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message || 'Could not save your profile.');
      return false;
    }
    return true;
  }

  /** Finish the questionnaire: save, recompute matches, then reveal the total. */
  async function finish(collected: Answers) {
    setSubmitting(true);
    setError('');
    try {
      const ok = await saveProfile(collected);
      if (!ok) {
        setSubmitting(false);
        return;
      }

      // Recompute + persist matches. Non-fatal if it hiccups.
      let matchesCount = 0;
      try {
        const res = await fetch('/api/matches', { method: 'POST' });
        if (res.ok) {
          const j = await res.json();
          matchesCount = Number(j.count) || 0;
        }
      } catch {
        /* ignore — the estimate call below is the source of truth */
      }

      // Ask for the money reveal.
      let count = matchesCount;
      let totalOwed = 0;
      try {
        const res = await fetch('/api/estimate', { method: 'POST' });
        if (res.ok) {
          const j = await res.json();
          count = Number(j.count) || 0;
          totalOwed = Number(j.totalOwed) || 0;
        }
      } catch {
        /* ignore — fall back to the matches count with no dollar figure */
      }

      setReveal({ count, totalOwed });
      setSubmitting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  /** Skip the reveal — just save and head to the dashboard. */
  async function skip() {
    setSubmitting(true);
    setError('');
    try {
      const ok = await saveProfile(answers);
      if (!ok) {
        setSubmitting(false);
        return;
      }
      // Fire-and-forget a match recompute so the dashboard isn't empty.
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

  function goToDashboard() {
    router.push('/dashboard');
    router.refresh();
  }

  // Reveal step ------------------------------------------------------------
  if (reveal) {
    const found = reveal.count > 0;
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700">
          {found ? (
            <PartyPopper className="h-7 w-7" />
          ) : (
            <Sparkles className="h-7 w-7" />
          )}
        </div>

        {found ? (
          <>
            <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-700">
              Good news
            </p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              We found {reveal.count}{' '}
              {reveal.count === 1 ? 'settlement' : 'settlements'} you likely
              qualify for
            </h2>
            {reveal.totalOwed > 0 && (
              <p className="mt-4 text-ink-muted">
                worth an estimated
              </p>
            )}
            {reveal.totalOwed > 0 && (
              <div className="mt-1 font-display text-5xl font-extrabold text-success-600 sm:text-6xl">
                {formatUSD(reveal.totalOwed)}
              </div>
            )}
            <p className="mx-auto mt-5 max-w-md text-sm text-ink-muted">
              We’ll file every one of them on your behalf and only take our fee
              when you actually get paid.
            </p>
            <button
              type="button"
              onClick={goToDashboard}
              className="btn-primary mt-7 w-full sm:w-auto"
            >
              See my settlements <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h2 className="mt-5 text-2xl font-extrabold sm:text-3xl">
              You’re all set
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
              We didn’t find an open settlement that fits your profile just yet —
              but new ones open all the time. We’ll keep watching and email you
              the moment a match appears.
            </p>
            <button
              type="button"
              onClick={goToDashboard}
              className="btn-primary mt-7 w-full sm:w-auto"
            >
              Go to my dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    );
  }

  // Questionnaire step -----------------------------------------------------
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
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Finding your money…
            </>
          ) : isLast ? (
            <>
              See what I’m owed <Search className="h-4 w-4" />
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
          onClick={() => void skip()}
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
