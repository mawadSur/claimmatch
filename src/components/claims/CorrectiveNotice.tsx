'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type { ClaimView } from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';
import { updateClaim } from './claim-api';
import { ClaimError, type ClaimErrorState } from './ClaimError';

type Answered = (claim: ClaimView, message: string) => void;

/**
 * The one-tap answers on the corrective notice (D42) for a legacy claim:
 * "I already filed" records it at once (the confirmation number can be added
 * next), and "I haven't filed yet" marks it Not filed yet.
 */
export function LegacyClaimAnswer({ claimId, onAnswered }: { claimId: string; onAnswered: Answered }) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState<null | 'filed' | 'not_yet'>(null);
  const [error, setError] = useState<ClaimErrorState | null>(null);

  async function answer(kind: 'filed' | 'not_yet') {
    setBusy(kind);
    setError(null);
    const result = await updateClaim(claimId, {
      action: kind === 'filed' ? 'report_filed' : 'acknowledge_notice',
    });
    setBusy(null);
    if (!result.ok) {
      setError({ message: result.error, status: result.status });
      return;
    }
    posthog?.capture('corrective_notice_answered', {
      answer: kind === 'filed' ? 'already_filed' : 'not_filed_yet',
    });
    onAnswered(
      result.claim,
      kind === 'filed'
        ? 'Thanks. We saved that you already filed. Add your confirmation number if you have it.'
        : 'Thanks. This claim now shows Not filed yet. File on the official site before the deadline.',
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary" onClick={() => answer('filed')} disabled={busy !== null}>
          {busy === 'filed' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          I already filed
        </button>
        <button type="button" className="btn-secondary" onClick={() => answer('not_yet')} disabled={busy !== null}>
          {busy === 'not_yet' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          I haven&rsquo;t filed yet
        </button>
      </div>
      <ClaimError error={error} className="mt-2" />
    </div>
  );
}

/** What to do about one legacy claim: file before the deadline, or tell us you already did. */
export function LegacyClaimGuidance({
  deadline,
  deadlinePassed,
  officialUrl,
}: {
  deadline: string | null;
  deadlinePassed: boolean;
  officialUrl: string | null;
}) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-amber-950">
      <li>
        {deadlinePassed ? (
          <>
            The deadline was <strong>{formatDeadline(deadline)}</strong>. If you filed
            on the official site before then, tell us below.
          </>
        ) : (
          <>
            <strong>Haven&rsquo;t filed yet?</strong> You still can, on the official
            site{deadline ? <> before the deadline, <strong>{formatDeadline(deadline)}</strong></> : null}.
            {officialUrl && (
              <>
                {' '}
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded font-semibold text-amber-950 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  Open the official claim form
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </>
            )}
          </>
        )}
      </li>
      <li>
        <strong>Already filed there yourself?</strong> Don&rsquo;t file again. Just tell
        us here.
      </li>
    </ul>
  );
}

/** The corrective notice on the claim page, for one legacy claim. */
export function CorrectiveNotice({
  claimId,
  deadline,
  deadlinePassed,
  officialUrl,
  onAnswered,
}: {
  claimId: string;
  deadline: string | null;
  deadlinePassed: boolean;
  officialUrl: string | null;
  onAnswered: Answered;
}) {
  return (
    <section
      aria-labelledby="corrective-notice-title"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6"
    >
      <h2 id="corrective-notice-title" className="flex items-start gap-2 text-lg font-bold text-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        ClaimMatch did not file this claim
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-amber-950">
        Earlier, ClaimMatch showed &ldquo;Claim filed&rdquo; for this settlement. That
        was wrong. We never sent anything to the settlement administrator, and we
        never file claims for anyone.
      </p>
      <LegacyClaimGuidance deadline={deadline} deadlinePassed={deadlinePassed} officialUrl={officialUrl} />
      <div className="mt-4">
        <LegacyClaimAnswer claimId={claimId} onAnswered={onAnswered} />
      </div>
    </section>
  );
}

export const FICTIONAL_TEXT =
  'was test data that should never have been shown as a real settlement. ClaimMatch did not file anything, and there is nothing for you to do. Please ignore any earlier message about it.';

/** "Got it" for a claim on a fictional settlement (closes it out). */
export function AcknowledgeFictionalButton({ claimId, onDone }: { claimId: string; onDone: Answered }) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClaimErrorState | null>(null);

  async function acknowledge() {
    setBusy(true);
    setError(null);
    const result = await updateClaim(claimId, { action: 'acknowledge_notice' });
    setBusy(false);
    if (!result.ok) {
      setError({ message: result.error, status: result.status });
      return;
    }
    posthog?.capture('corrective_notice_answered', { answer: 'not_a_real_settlement' });
    onDone(result.claim, 'Thanks. We closed this out. There is nothing more to do.');
  }

  return (
    <div>
      <button type="button" className="btn-secondary" onClick={acknowledge} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Got it
      </button>
      <ClaimError error={error} className="mt-2" />
    </div>
  );
}

/** For a claim on one of the fictional settlements: it was not real, nothing to do. */
export function FictionalNotice({
  claimId,
  title,
  acknowledged,
  onAcknowledged,
}: {
  claimId: string;
  title: string;
  acknowledged: boolean;
  onAcknowledged: Answered;
}) {
  return (
    <section aria-labelledby="fictional-notice-title" className="rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
      <h2 id="fictional-notice-title" className="flex items-start gap-2 text-lg font-bold">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
        This settlement was not real
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        &ldquo;{title}&rdquo; {FICTIONAL_TEXT}
      </p>
      {acknowledged ? (
        <p className="mt-4 text-sm font-semibold text-ink">You&rsquo;re all set. Nothing more to do.</p>
      ) : (
        <div className="mt-4">
          <AcknowledgeFictionalButton claimId={claimId} onDone={onAcknowledged} />
        </div>
      )}
    </section>
  );
}
