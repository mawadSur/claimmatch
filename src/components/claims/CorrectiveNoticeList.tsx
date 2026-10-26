'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type { ClaimView } from '@/lib/claims';
import type { NoticeItem } from './dashboard-model';
import { AddConfirmationForm } from './AddConfirmationForm';
import { acknowledgeAllFictional } from './claim-api';
import { ClaimError, type ClaimErrorState } from './ClaimError';
import {
  AcknowledgeFictionalButton,
  FICTIONAL_TEXT,
  LegacyClaimAnswer,
  LegacyClaimGuidance,
} from './CorrectiveNotice';

/** Rows shown before "Show all": an account the old File-all flow filled can have hundreds. */
export const NOTICE_PREVIEW = 5;
// One refresh after a burst of answers, not one per tap (each re-reads the
// claims and the catalog).
const REFRESH_DELAY_MS = 1500;
const FICTIONAL_DONE = 'Thanks. We closed this out. There is nothing more to do.';

interface Answer {
  claim: ClaimView;
  message: string;
}

/**
 * The dashboard's corrective notice (D42): one row per legacy claim the old
 * flow called "filed", each with one-tap answers, and a "not real" note for
 * claims on fictional settlements. Rows come soonest open deadline first
 * (sortNotices); the first few show until "Show all". Answered rows stay
 * visible with a confirmation until the page is left; the claim list below
 * refreshes once the answers settle.
 */
export function CorrectiveNoticeList({ items }: { items: NoticeItem[] }) {
  const router = useRouter();
  const posthog = usePostHog();
  // Keep the first list: after a refresh the server drops answered rows.
  const [rows] = useState(items);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showAll, setShowAll] = useState(false);
  // One live region, present from the first render, so every answer is
  // announced (a region created together with its text often is not).
  const [announcement, setAnnouncement] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<ClaimErrorState | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // "Show all" disappears once used: move focus to the first row it revealed.
  useEffect(() => {
    if (showAll) document.getElementById(`notice-row-${rows[NOTICE_PREVIEW]?.claimId}`)?.focus();
  }, [showAll, rows]);

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
  }

  function answered(claimId: string, claim: ClaimView, message: string) {
    setAnswers((prev) => ({ ...prev, [claimId]: { claim, message } }));
    setAnnouncement(message);
    scheduleRefresh();
  }

  const openFictional = rows.filter((r) => r.kind === 'fictional' && !answers[r.claimId]);

  async function acknowledgeAll() {
    if (bulkBusy) return;
    setBulkBusy(true);
    setBulkError(null);
    const result = await acknowledgeAllFictional();
    setBulkBusy(false);
    // Rows saved before an error still count as answered.
    if (result.claims.length > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const claim of result.claims) next[claim.id] = { claim, message: FICTIONAL_DONE };
        return next;
      });
      posthog?.capture('corrective_notice_answered', { answer: 'not_a_real_settlement', bulk: true });
      setAnnouncement(
        result.claims.length === 1
          ? 'Thanks. We closed out the settlement that was not real.'
          : `Thanks. We closed out ${result.claims.length} settlements that were not real.`,
      );
      scheduleRefresh();
    }
    if (!result.ok) setBulkError({ message: result.error, status: result.status });
  }

  const legacyCount = rows.filter((r) => r.kind === 'legacy').length;
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, NOTICE_PREVIEW);
  const hidden = rows.length - visible.length;

  return (
    <section
      aria-labelledby="corrective-notice-title"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-card sm:p-6"
    >
      <h2 id="corrective-notice-title" className="flex items-start gap-2 text-xl font-extrabold text-amber-950">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        {legacyCount === 0
          ? 'A settlement in your list was not real'
          : legacyCount === 1
            ? 'ClaimMatch did not file your claim'
            : 'ClaimMatch did not file your claims'}
      </h2>
      {legacyCount > 0 && (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-amber-950">
          Earlier, ClaimMatch showed &ldquo;Claim filed&rdquo; for{' '}
          {legacyCount === 1 ? 'the settlement below' : 'the settlements below'}. That
          was wrong. We never sent anything to a settlement administrator, and we
          never file claims for anyone.{' '}
          {legacyCount === 1 ? 'Tell us where things stand.' : 'For each one, tell us where things stand.'}
        </p>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {openFictional.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            className="btn-secondary aria-disabled:cursor-wait aria-disabled:opacity-60"
            onClick={acknowledgeAll}
            aria-disabled={bulkBusy}
          >
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Got it for all {openFictional.length} that were not real
          </button>
          <ClaimError error={bulkError} className="mt-2" />
        </div>
      )}

      <ul id="corrective-notice-rows" className="mt-5 space-y-3">
        {visible.map((item) => {
          const answer = answers[item.claimId];
          return (
            <li key={item.claimId} className="rounded-xl bg-white p-4 ring-1 ring-amber-200 sm:p-5">
              <p
                id={`notice-row-${item.claimId}`}
                tabIndex={-1}
                className="rounded font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {item.title}
              </p>
              {answer ? (
                <AnsweredRow claimId={item.claimId} answer={answer} onSaved={answered} />
              ) : item.kind === 'fictional' ? (
                <>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">This settlement {FICTIONAL_TEXT}</p>
                  <div className="mt-3">
                    <AcknowledgeFictionalButton
                      claimId={item.claimId}
                      onDone={(claim, message) => answered(item.claimId, claim, message)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <LegacyClaimGuidance deadline={item.deadline} filing={item.filing} officialUrl={item.officialUrl} />
                  <div className="mt-4">
                    <LegacyClaimAnswer
                      claimId={item.claimId}
                      filing={item.filing}
                      hasDeadline={Boolean(item.deadline)}
                      onAnswered={(claim, message) => answered(item.claimId, claim, message)}
                    />
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="btn-ghost mt-3"
          aria-expanded={false}
          aria-controls="corrective-notice-rows"
          onClick={() => setShowAll(true)}
        >
          Show all {rows.length}
        </button>
      )}
    </section>
  );
}

function AnsweredRow({
  claimId,
  answer,
  onSaved,
}: {
  claimId: string;
  answer: Answer;
  onSaved: (claimId: string, claim: ClaimView, message: string) => void;
}) {
  const messageRef = useRef<HTMLParagraphElement>(null);
  const askNumber = answer.claim.status === 'reported_filed';
  // The buttons that had focus are gone: keep keyboard users in this row, on
  // the confirmation-number field after "I already filed", otherwise on the
  // confirmation. (The list's live region announces it.)
  useEffect(() => {
    if (!askNumber) messageRef.current?.focus();
  }, [answer.message, askNumber]);
  return (
    <div>
      <p
        ref={messageRef}
        tabIndex={-1}
        className="mt-1 flex items-start gap-2 rounded text-sm font-medium text-success-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {answer.message}
      </p>
      {askNumber && (
        <div className="mt-4">
          <AddConfirmationForm
            claimId={claimId}
            autoFocus
            onSaved={(claim, message) => onSaved(claimId, claim, message)}
          />
        </div>
      )}
    </div>
  );
}
