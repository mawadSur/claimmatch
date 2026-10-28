'use client';

import { useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { posthogMatchEventName, posthogMatchProperties } from '@/lib/match-events';

/**
 * Lets a signed-in user mark a match as not relevant, or say they submitted
 * / were paid. Writes labels when MATCH_METRICS_ENABLED is on (the API no-ops
 * otherwise). Optional health answers are never sent.
 */
export function MatchFeedback({
  lawsuitId,
  score,
  reasons,
}: {
  lawsuitId: string;
  score: number;
  reasons: string[];
}) {
  const posthog = usePostHog();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [choice, setChoice] = useState<string | null>(null);

  async function report(label: 'not_relevant' | 'filed' | 'paid') {
    setStatus('saving');
    try {
      const eventType = label === 'not_relevant' ? 'dismiss' : label === 'paid' ? 'user_reported_payout' : 'filed';
      const props = posthogMatchProperties({
        lawsuitId,
        score,
        matchedSignals: reasons,
      });
      posthog?.capture(posthogMatchEventName(eventType), props);
      const res = await fetch('/api/match-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawsuit_id: lawsuitId, label, score, matched_signals: reasons }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setChoice(label);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="mt-3 text-xs text-ink-muted">
      <p className="font-medium text-ink">Was this useful?</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold hover:border-brand-300 hover:text-brand-700"
          disabled={status === 'saving'}
          onClick={() => report('not_relevant')}
        >
          Not relevant
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold hover:border-brand-300 hover:text-brand-700"
          disabled={status === 'saving'}
          onClick={() => report('filed')}
        >
          I submitted this
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-2.5 py-1 font-semibold hover:border-brand-300 hover:text-brand-700"
          disabled={status === 'saving'}
          onClick={() => report('paid')}
        >
          I got paid
        </button>
      </div>
      <p className="mt-1" aria-live="polite">
        {status === 'saved' && choice === 'not_relevant' && 'Marked not relevant.'}
        {status === 'saved' && choice === 'filed' && 'Thanks — we recorded that you submitted it.'}
        {status === 'saved' && choice === 'paid' && 'Thanks — we recorded that you were paid.'}
        {status === 'error' && 'Could not save that just now.'}
      </p>
    </div>
  );
}
