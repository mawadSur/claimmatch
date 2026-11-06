'use client';

import { useMemo, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { withFunnelAttribution } from '@/lib/funnel';
import { eligibilityQuizPrompts, eligibilityQuizResultCopy } from '@/lib/settlement-quiz';

type Choice = 'yes' | 'no' | 'unsure';

export function SettlementEligibilityQuiz({
  eligibilityText,
  lawsuitId,
  slug,
}: {
  eligibilityText: string | null;
  lawsuitId: string;
  slug: string;
}) {
  const prompts = useMemo(() => eligibilityQuizPrompts(eligibilityText), [eligibilityText]);
  const posthog = usePostHog();
  const [answers, setAnswers] = useState<Record<number, Choice>>({});
  const [submitted, setSubmitted] = useState(false);
  const started = useRef(false);

  if (prompts.length === 0) return null;

  const yes = Object.values(answers).filter((v) => v === 'yes').length;
  const no = Object.values(answers).filter((v) => v === 'no').length;

  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold">Check if you qualify</h2>
      <p className="mt-1 text-sm text-ink-muted">
        These points come from our listing. They are not the official rules, and
        this checklist is not a qualification decision.
      </p>
      <ol className="mt-4 space-y-4">
        {prompts.map((prompt, i) => (
          <li key={prompt}>
            <p className="text-sm leading-relaxed text-ink">{prompt}</p>
            <fieldset className="mt-2 flex flex-wrap gap-2" aria-label={`Does this describe you: ${prompt}`}>
              {(['yes', 'no', 'unsure'] as const).map((choice) => (
                <label
                  key={choice}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    answers[i] === choice
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-slate-200 text-ink-muted'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`quiz-${i}`}
                    value={choice}
                    checked={answers[i] === choice}
                    onChange={() => {
                      setSubmitted(false);
                      setAnswers((prev) => ({ ...prev, [i]: choice }));
                      if (!started.current) {
                        started.current = true;
                        posthog?.capture(
                          ANALYTICS_EVENTS.eligibility_quiz_started,
                          withFunnelAttribution({
                            lawsuit_id: lawsuitId,
                            slug,
                            prompt_count: prompts.length,
                            signed_out: true,
                          }),
                        );
                      }
                    }}
                  />
                  {choice === 'yes' ? 'This may describe me' : choice === 'no' ? 'This does not' : 'Not sure'}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn-secondary mt-5"
        onClick={() => {
          setSubmitted(true);
          posthog?.capture(
            ANALYTICS_EVENTS.eligibility_quiz_completed,
            withFunnelAttribution({
              lawsuit_id: lawsuitId,
              slug,
              checks_yes: yes,
              checks_no: no,
              checks_total: prompts.length,
              is_filing: false,
              is_qualify_verdict: false,
            }),
          );
        }}
      >
        See what the listing suggests
      </button>
      {submitted && (
        <p className="mt-3 text-sm leading-relaxed text-ink" role="status">
          {eligibilityQuizResultCopy({ yes, no, total: prompts.length })}
        </p>
      )}
    </div>
  );
}
