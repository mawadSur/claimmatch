'use client';

import { useEffect, useState } from 'react';
import {
  PROOF_FEEDBACK_PROMPT,
  type ProofFeedbackAnswer,
} from '@/lib/proof-feedback';

const OPTIONS: { value: ProofFeedbackAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];

/**
 * Signed-in one-tap crowd signal. Never rendered as a public fact.
 */
export function ProofFeedback({ lawsuitId }: { lawsuitId: string }) {
  const [answer, setAnswer] = useState<ProofFeedbackAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proof-feedback?lawsuit_id=${encodeURIComponent(lawsuitId)}`)
      .then(async (res) => {
        if (res.status === 401 || res.status === 404) return null;
        const json = (await res.json()) as { answer?: ProofFeedbackAnswer | null };
        return json.answer ?? null;
      })
      .then((existing) => {
        if (!cancelled) {
          if (existing) setAnswer(existing);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lawsuitId]);

  async function submit(next: ProofFeedbackAnswer) {
    if (answer || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/proof-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawsuit_id: lawsuitId, answer: next }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 401) {
        setError('Log in to answer.');
        return;
      }
      if (!res.ok) {
        setError(json?.error || 'Could not save your answer.');
        return;
      }
      setAnswer(next);
    } catch {
      setError('Could not save your answer.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-bold">{PROOF_FEEDBACK_PROMPT}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        After you visit the official site, tap what it asked for. This stays
        between you and ClaimMatch — we do not show it as a fact on the listing.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={busy || answer !== null}
            onClick={() => submit(opt.value)}
            className={
              answer === opt.value
                ? 'btn-primary !py-2 text-sm'
                : 'btn-secondary !py-2 text-sm'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      {answer && (
        <p className="mt-3 text-sm text-ink-muted">Thanks — we saved your answer.</p>
      )}
      {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}
    </div>
  );
}
