'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  MATCH_PREVIEW_ATTRIBUTE_KEYS,
  MATCH_PREVIEW_QUESTIONS,
  emptyMatchPreviewDraft,
  parseMatchPreviewDraft,
  readStoredMatchPreview,
  writeStoredMatchPreview,
  type MatchPreviewAttributeKey,
  type MatchPreviewDraft,
  type MatchPreviewResult,
} from '@/lib/match-preview';
import { claimReturnPath } from '@/lib/signup-context';
import { formatDeadline, US_STATES } from '@/lib/utils';

type Step = 'questions' | 'results';

export function MatchPreview({
  signupContextEnabled,
  feeNote,
}: {
  signupContextEnabled: boolean;
  feeNote: ReactNode;
}) {
  const posthog = usePostHog();
  const started = useRef(false);
  const [draft, setDraft] = useState<MatchPreviewDraft>(emptyMatchPreviewDraft);
  const [step, setStep] = useState<Step>('questions');
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState<MatchPreviewResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const questions = MATCH_PREVIEW_QUESTIONS;
  const current = questions[index];
  const last = index >= questions.length - 1;

  useEffect(() => {
    const stored = readStoredMatchPreview();
    if (stored) setDraft(stored);
  }, []);

  useEffect(() => {
    if (started.current || !posthog) return;
    started.current = true;
    posthog.capture('match_preview_started');
  }, [posthog]);

  const progress = useMemo(
    () => `${Math.min(index + 1, questions.length)} of ${questions.length}`,
    [index, questions.length],
  );

  function persist(next: MatchPreviewDraft) {
    setDraft(next);
    writeStoredMatchPreview(next);
  }

  function currentKey(): MatchPreviewAttributeKey | null {
    return current && current.type !== 'state' && current.key
      ? (current.key as MatchPreviewAttributeKey)
      : null;
  }

  function currentAnswered(): boolean {
    if (!current) return false;
    if (current.type === 'state') return Boolean(draft.state);
    const key = currentKey();
    return !!key && typeof draft.attributes[key] === 'boolean';
  }

  async function finish() {
    setError('');
    setBusy(true);
    try {
      const payload = parseMatchPreviewDraft(draft) ?? draft;
      writeStoredMatchPreview(payload);
      const res = await fetch('/api/match-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { matches?: MatchPreviewResult[]; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error || 'We couldn’t load matches right now. Please try again.');
        return;
      }
      const rows = json?.matches ?? [];
      setMatches(rows);
      setStep('results');
      posthog?.capture('match_preview_completed', { match_count: rows.length });
    } catch {
      setError('We couldn’t reach ClaimMatch. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAnswered()) {
      setError(current?.type === 'state' ? 'Pick your state to continue.' : 'Choose yes or no to continue.');
      return;
    }
    setError('');
    if (last) {
      void finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function signupHref(slug?: string) {
    if (signupContextEnabled && slug) {
      const nextPath = claimReturnPath(slug);
      return nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : '/signup';
    }
    return '/signup';
  }

  if (step === 'results') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <h2 className="text-xl font-bold">Settlements that may apply</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Each result is labeled Strong match or Possible match, using the same
          matcher as a signed-in profile. That is not a decision that you
          qualify. The official notice has the rules.
        </p>

        {matches.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <p className="font-semibold text-ink">No matching open settlements from these answers.</p>
            <p className="mt-1 text-sm text-ink-muted">
              You can still browse the full list. Creating an account lets you
              save matches later.
            </p>
            <Link href="/lawsuits" className="btn-secondary mt-5">
              Browse open settlements
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {matches.map((match) => (
              <li key={match.slug} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={match.strength === 'strong' ? 'badge-brand' : 'badge-gray'}>
                    {match.strengthLabel}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold leading-snug">
                  <Link href={`/lawsuits/${match.slug}`} className="rounded hover:text-brand-700">
                    {match.title}
                  </Link>
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Payout, as listed</dt>
                    <dd className="mt-0.5 font-semibold text-ink">
                      {match.typical_payout ?? 'Not stated'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Deadline</dt>
                    <dd className="mt-0.5 font-semibold text-ink">
                      {match.deadline ? formatDeadline(match.deadline) : 'No deadline listed'}
                    </dd>
                  </div>
                </dl>
                {match.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                    {match.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link href={`/claim/${match.slug}`} className="btn-primary">
                    Start this claim <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link href={signupHref(match.slug)} className="btn-secondary">
                    Save with a free account
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-sm font-semibold text-ink">Create a free account</p>
          <p className="mt-1 text-sm text-ink-muted">
            Save these matches so you don&rsquo;t answer again, and keep track of
            the claims you file on official settlement websites.
          </p>
          <Link href={signupHref()} className="btn-primary mt-4">
            Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <div className="mt-5">{feeNote}</div>
          <button
            type="button"
            className="btn-ghost mt-4"
            onClick={() => {
              setStep('questions');
              setIndex(0);
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Change answers
          </button>
        </div>
      </div>
    );
  }

  const selected = currentKey() ? draft.attributes[currentKey()!] : undefined;

  return (
    <form onSubmit={next} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Question {progress}
      </p>
      <h2 className="mt-2 text-lg font-bold">{current?.label}</h2>
      {current?.help && <p className="mt-1 text-sm text-ink-muted">{current.help}</p>}

      <div className="mt-6">
        {current?.type === 'state' ? (
          <label className="block">
            <span className="field-label">State you live in</span>
            <select
              className="field-input"
              value={draft.state}
              onChange={(e) => persist({ ...draft, state: e.target.value })}
              autoComplete="address-level1"
            >
              <option value="">Choose your state…</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={selected === true ? 'btn-primary justify-center' : 'btn-secondary justify-center'}
              onClick={() => {
                const key = currentKey();
                if (key) persist({ ...draft, attributes: { ...draft.attributes, [key]: true } });
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className={selected === false ? 'btn-primary justify-center' : 'btn-secondary justify-center'}
              onClick={() => {
                const key = currentKey();
                if (key) persist({ ...draft, attributes: { ...draft.attributes, [key]: false } });
              }}
            >
              No
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        {index > 0 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setError('');
              setIndex((i) => Math.max(0, i - 1));
            }}
            disabled={busy}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking settlements…
            </>
          ) : last ? (
            <>
              See matching settlements <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
