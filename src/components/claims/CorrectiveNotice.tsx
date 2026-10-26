'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { legacyAnswerCopy, type ClaimView, type LegacyFilingState } from '@/lib/claims';
import { formatDeadline } from '@/lib/utils';
import { updateClaim } from './claim-api';
import { ClaimError, type ClaimErrorState } from './ClaimError';

type Answered = (claim: ClaimView, message: string) => void;

/**
 * The one-tap answers on the corrective notice (D42) for a legacy claim:
 * "I already filed" records it at once (the confirmation number can be added
 * next), and "I haven't filed yet" (after the deadline, "I didn't file")
 * records that. Both stay reversible: "I filed" remains available.
 */
export function LegacyClaimAnswer({
  claimId,
  filing,
  hasDeadline,
  onAnswered,
}: {
  claimId: string;
  filing: LegacyFilingState;
  hasDeadline: boolean;
  onAnswered: Answered;
}) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState<null | 'filed' | 'not_yet'>(null);
  const [error, setError] = useState<ClaimErrorState | null>(null);
  const copy = legacyAnswerCopy(filing, hasDeadline);

  async function answer(kind: 'filed' | 'not_yet') {
    if (busy) return;
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
    onAnswered(result.claim, kind === 'filed' ? copy.filedMessage : copy.notYetMessage);
  }

  return (
    <div>
      {/* aria-disabled, not disabled, while saving: a disabled button drops
          keyboard focus. answer() ignores taps while busy. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-primary aria-disabled:cursor-wait aria-disabled:opacity-60"
          onClick={() => answer('filed')}
          aria-disabled={busy !== null}
        >
          {busy === 'filed' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          I already filed
        </button>
        <button
          type="button"
          className="btn-secondary aria-disabled:cursor-wait aria-disabled:opacity-60"
          onClick={() => answer('not_yet')}
          aria-disabled={busy !== null}
        >
          {busy === 'not_yet' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {copy.notYetLabel}
        </button>
      </div>
      <ClaimError error={error} className="mt-2" />
    </div>
  );
}

function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded font-semibold text-amber-950 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * What to do about one legacy claim: file before the deadline, or tell us you
 * already did. "You still can" only while our list shows the settlement open;
 * a settlement it marks closed, or no longer lists, is being re-checked (D41).
 */
export function LegacyClaimGuidance({
  deadline,
  filing,
  officialUrl,
}: {
  deadline: string | null;
  filing: LegacyFilingState;
  officialUrl: string | null;
}) {
  return (
    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-amber-950">
      <li>
        {filing === 'deadline_passed' ? (
          <>
            The deadline was <strong>{formatDeadline(deadline)}</strong>. If you filed
            on the official site before then, tell us below.
          </>
        ) : filing === 'open' ? (
          <>
            <strong>Haven&rsquo;t filed yet?</strong> You still can, on the official
            site{deadline ? <> before the deadline, <strong>{formatDeadline(deadline)}</strong></> : null}.
            {officialUrl && (
              <>
                {' '}
                <OfficialLink href={officialUrl}>Open the official claim form</OfficialLink>
              </>
            )}
          </>
        ) : (
          <>
            <strong>Haven&rsquo;t filed yet?</strong>{' '}
            {filing === 'closed_on_list'
              ? 'Our list shows this settlement as closed, and we’re re-checking it.'
              : 'This settlement is no longer listed on ClaimMatch while we re-check it.'}{' '}
            Check the official site to see if it still takes claims.
            {officialUrl && (
              <>
                {' '}
                <OfficialLink href={officialUrl}>Check the official site</OfficialLink>
              </>
            )}
          </>
        )}
        {!officialUrl && filing !== 'deadline_passed' && (
          <>
            {' '}
            We don&rsquo;t have the official link. Use the link in the notice you got by
            mail or email, and only file on the site that notice names.
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
  filing,
  officialUrl,
  onAnswered,
}: {
  claimId: string;
  deadline: string | null;
  filing: LegacyFilingState;
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
      <LegacyClaimGuidance deadline={deadline} filing={filing} officialUrl={officialUrl} />
      <div className="mt-4">
        <LegacyClaimAnswer claimId={claimId} filing={filing} hasDeadline={Boolean(deadline)} onAnswered={onAnswered} />
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
    if (busy) return;
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
      <button
        type="button"
        className="btn-secondary aria-disabled:cursor-wait aria-disabled:opacity-60"
        onClick={acknowledge}
        aria-disabled={busy}
      >
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
