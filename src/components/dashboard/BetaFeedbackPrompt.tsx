'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Loader2, X } from 'lucide-react';
import {
  ANALYTICS_EVENTS,
  betaFeedbackShownProperties,
  betaFeedbackSubmittedProperties,
  type BetaFeedbackTrigger,
} from '@/lib/analytics/events';
import { withFunnelAttribution } from '@/lib/funnel';
import { BETA_FEEDBACK_MAX_CHARS } from '@/lib/beta-feedback';

export function BetaFeedbackPrompt({ trigger }: { trigger: BetaFeedbackTrigger }) {
  const posthog = usePostHog();
  const shown = useRef(false);
  const titleId = useId();
  const [almostStopped, setAlmostStopped] = useState('');
  const [whatsMissing, setWhatsMissing] = useState('');
  const [interviewOptIn, setInterviewOptIn] = useState(false);
  const [status, setStatus] = useState<'open' | 'saving' | 'done' | 'hidden'>('open');
  const [error, setError] = useState('');

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    posthog?.capture(
      ANALYTICS_EVENTS.beta_feedback_shown,
      withFunnelAttribution(betaFeedbackShownProperties({ trigger })),
    );
  }, [posthog, trigger]);

  async function submit(dismissed: boolean) {
    setStatus('saving');
    setError('');
    const payload = {
      almost_stopped: dismissed ? '' : almostStopped,
      whats_missing: dismissed ? '' : whatsMissing,
      interview_opt_in: dismissed ? false : interviewOptIn,
      dismissed,
      trigger,
    };
    try {
      const res = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus('open');
        setError(json.error || 'Could not save that just now.');
        return;
      }
      posthog?.capture(
        ANALYTICS_EVENTS.beta_feedback_submitted,
        withFunnelAttribution(
          betaFeedbackSubmittedProperties({
            trigger,
            interviewOptIn: dismissed ? false : interviewOptIn,
            hasAlmostStopped: !dismissed && almostStopped.trim().length > 0,
            hasWhatsMissing: !dismissed && whatsMissing.trim().length > 0,
            dismissed,
          }),
        ),
      );
      setStatus(dismissed ? 'hidden' : 'done');
    } catch {
      setStatus('open');
      setError('Could not reach Lawsuit AI. Check your connection and try again.');
    }
  }

  if (status === 'hidden') return null;

  if (status === 'done') {
    return (
      <section
        aria-labelledby={titleId}
        className="rounded-2xl border border-success-100 bg-white p-5 shadow-card"
      >
        <h2 id={titleId} className="text-base font-bold text-ink">
          Thanks — that helps
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          We read every note. We won&apos;t email you from this form.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-brand-200 bg-white p-5 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-base font-bold text-ink">
            Two quick questions
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Optional. Answers stay on your account so we can improve the beta.
            We never email you from this form.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-gray-50 hover:text-ink"
          onClick={() => void submit(true)}
          aria-label="Dismiss feedback prompt"
          disabled={status === 'saving'}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <label className="block">
          <span className="text-sm font-semibold text-ink">What almost stopped you?</span>
          <textarea
            className="field-input mt-1 min-h-[4.5rem]"
            maxLength={BETA_FEEDBACK_MAX_CHARS}
            value={almostStopped}
            onChange={(e) => setAlmostStopped(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink">What&apos;s missing?</span>
          <textarea
            className="field-input mt-1 min-h-[4.5rem]"
            maxLength={BETA_FEEDBACK_MAX_CHARS}
            value={whatsMissing}
            onChange={(e) => setWhatsMissing(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={interviewOptIn}
            onChange={(e) => setInterviewOptIn(e.target.checked)}
          />
          <span>I&apos;m open to a 15-minute call</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={status === 'saving'}>
            {status === 'saving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              'Send'
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={status === 'saving'}
            onClick={() => void submit(true)}
          >
            Not now
          </button>
        </div>
      </form>
    </section>
  );
}
