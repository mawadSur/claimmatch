'use client';

import { useCallback, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ClaimTone, ClaimView } from '@/lib/claims';
import { ONE_CLICK_COPY, ONE_CLICK_SELF_FILE_TITLE } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import {
  claimPageNote,
  claimViewFromFiling,
  filingStatusDisplay,
  hasOneClickHistory,
  isOneClickStatus,
  laneReasonLines,
} from './filing-model';
import { FilingTimeline } from './FilingTimeline';
import { OneClickEntry } from './OneClickEntry';
import { OneClickFiling } from './OneClickFiling';
import { PreparedAnswers } from './PreparedAnswers';
import type { OneClickClaimProps } from './types';

/** What ClaimFlow shows for one-click filing; null when ONE_CLICK_FILING_ENABLED is off. */
export interface OneClickClaimParts {
  /** The claim is in a one-click status: `flow` replaces the self-file steps. */
  active: boolean;
  flow: ReactNode;
  /** "Lawsuit AI files this claim for you" + "Start my claim", above the self-file steps. */
  entry: ReactNode;
  /** The one-click history of a reported or submitted claim. */
  history: ReactNode;
  /** Step 2 of the self-file steps: "Finish on the official site". */
  stepTwoTitle: string;
  /** Why Lawsuit AI can't file this claim (member-safe reasons), at the top of step 2. */
  stepTwoLead: ReactNode;
  /** A claim prepared in Lawsuit AI and now self-filed: its answers to copy, and its history. */
  prepared: ReactNode;
  badge: { label: string; tone: ClaimTone } | null;
  note: string;
}

/**
 * The claim page's one-click state: the claim's filing view, kept in step
 * with ClaimFlow's claim after every start, save, signature, withdrawal or
 * move to self-file. Hooks run whatever `oneClick` is; with it null the page
 * renders exactly as before.
 */
export function useOneClickClaim({
  oneClick,
  claim,
  lawsuitId,
  setClaim,
  announce,
}: {
  oneClick: OneClickClaimProps | null;
  claim: ClaimView | null;
  lawsuitId: string;
  setClaim: Dispatch<SetStateAction<ClaimView | null>>;
  /** A stable setter (ClaimFlow's announcement). */
  announce: (message: string) => void;
}): OneClickClaimParts | null {
  const [filing, setFiling] = useState<ClaimFilingView | null>(oneClick?.view ?? null);
  const onFilingChange = useCallback(
    (view: ClaimFilingView, message: string) => {
      setFiling(view);
      setClaim((current) => claimViewFromFiling(view, current));
      if (message) announce(message);
    },
    [setClaim, announce],
  );
  if (!oneClick) return null;

  const active = Boolean(claim && isOneClickStatus(claim.status));
  const lane = filing?.lane ?? oneClick.lane;
  const offerStart = Boolean(oneClick.canStart && lane?.agent && !active && (!claim || claim.status === 'self_file'));
  const reasons = offerStart ? [] : laneReasonLines(lane);
  const handedBack = claim?.status === 'self_file' && filing?.packet ? filing : null;

  return {
    active,
    flow: !active ? null : filing ? (
      <OneClickFiling view={filing} accountEmail={oneClick.accountEmail} onChange={onFilingChange} />
    ) : (
      <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-50 bg-white p-5 text-sm text-ink shadow-card">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden />
        {ONE_CLICK_COPY.loadFailed}
      </p>
    ),
    entry: offerStart && lane ? <OneClickEntry lane={lane} lawsuitId={lawsuitId} onStarted={onFilingChange} /> : null,
    history: filing && hasOneClickHistory(filing) ? <FilingTimeline entries={filing.timeline} /> : null,
    stepTwoTitle: ONE_CLICK_SELF_FILE_TITLE,
    stepTwoLead:
      reasons.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink-muted">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null,
    prepared: handedBack ? (
      <>
        <PreparedAnswers view={handedBack} />
        {hasOneClickHistory(handedBack) ? <FilingTimeline entries={handedBack.timeline} /> : null}
      </>
    ) : null,
    badge: active && claim ? filingStatusDisplay(claim.status, claim.confirmation_number) : null,
    note: claimPageNote({ status: claim?.status ?? null, lane, offerStart }),
  };
}
