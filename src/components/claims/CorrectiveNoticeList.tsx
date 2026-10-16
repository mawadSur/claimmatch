'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ClaimView } from '@/lib/claims';
import type { NoticeItem } from './dashboard-model';
import { AddConfirmationForm } from './AddConfirmationForm';
import {
  AcknowledgeFictionalButton,
  FICTIONAL_TEXT,
  LegacyClaimAnswer,
  LegacyClaimGuidance,
} from './CorrectiveNotice';

interface Answer {
  claim: ClaimView;
  message: string;
}

/**
 * The dashboard's corrective notice (D42): one row per legacy claim the old
 * flow called "filed", each with one-tap answers, and a "not real" note for
 * claims on fictional settlements. Answered rows stay visible with a
 * confirmation until the page is left; the claim list below refreshes.
 */
export function CorrectiveNoticeList({ items }: { items: NoticeItem[] }) {
  const router = useRouter();
  // Keep the first list: after a refresh the server drops answered rows.
  const [rows] = useState(items);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  function answered(claimId: string, claim: ClaimView, message: string) {
    setAnswers((prev) => ({ ...prev, [claimId]: { claim, message } }));
    router.refresh();
  }

  const legacyCount = rows.filter((r) => r.kind === 'legacy').length;
  if (rows.length === 0) return null;

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

      <ul className="mt-5 space-y-3">
        {rows.map((item) => {
          const answer = answers[item.claimId];
          return (
            <li key={item.claimId} className="rounded-xl bg-white p-4 ring-1 ring-amber-200 sm:p-5">
              <p className="font-semibold text-ink">{item.title}</p>
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
  return (
    <div role="status" aria-live="polite">
      <p className="mt-1 flex items-start gap-2 text-sm font-medium text-success-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {answer.message}
      </p>
      {answer.claim.status === 'reported_filed' && (
        <div className="mt-4">
          <AddConfirmationForm claimId={claimId} onSaved={(claim, message) => onSaved(claimId, claim, message)} />
        </div>
      )}
    </div>
  );
}
