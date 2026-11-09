import { legacyAnswerCopy, type ClaimView } from '@shared/lib/claims';
import { useCallback, useEffect, useRef, useState } from 'react';

import { common } from '@/copy/common';
import { closedOutMessage, notices } from '@/copy/notices';
import { savedFictionalClaims, useAcknowledgeFictional, useClaimAction } from '@/data/claims';
import { userFacingError } from '@/data/errors';

import {
  mergeNoticeRows,
  openFictionalRows,
  pruneAnswers,
  visibleAnswers,
  type NoticeAnswer,
  type NoticeAnswers,
} from './notice-rows';
import type { NoticeItem } from './types';

/** A one-tap answer: "I already filed", "I haven’t filed yet" (or "I didn’t file"), or "Got it" on a fictional row. */
export type NoticeAnswerKind = 'filed' | 'not_yet' | 'got_it';

/** "Got it for all": running, its error, or the summary of what it closed out. */
export interface BulkAcknowledgeState {
  busy: boolean;
  error: string | null;
  done: string | null;
}

export interface NoticeAnswersState {
  /** The rows to show, answered ones included (mergeNoticeRows). */
  rows: NoticeItem[];
  answers: NoticeAnswers;
  /** The answer being saved, per claim. */
  busy: Readonly<Record<string, NoticeAnswerKind>>;
  /** The last failed answer's message, per claim. */
  errors: Readonly<Record<string, string>>;
  openFictional: NoticeItem[];
  bulk: BulkAcknowledgeState;
  showAll: boolean;
  revealAll: () => void;
  answer: (item: NoticeItem, kind: NoticeAnswerKind) => void;
  /** The confirmation number was added in an answered row: show the saved claim and its message. */
  numberSaved: (item: NoticeItem, claim: ClaimView, message: string) => void;
  acknowledgeAllFictional: () => void;
  /** The screen lost focus or was pulled to refresh (the web's "page left"). */
  endVisit: () => void;
}

const IDLE: BulkAcknowledgeState = { busy: false, error: null, done: null };

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** The confirmation shown after an answer (CorrectiveNotice, legacyAnswerCopy). */
function confirmationFor(item: NoticeItem, kind: NoticeAnswerKind): string {
  if (kind === 'got_it') return notices.fictionalDone.text;
  const copy = legacyAnswerCopy(item.filing, Boolean(item.deadline));
  return kind === 'filed' ? copy.filedMessage : copy.notYetMessage;
}

function messageOf(error: unknown): string {
  return userFacingError(error)?.message ?? common.genericError.text;
}

/**
 * The dashboard's corrective-notice answers (CorrectiveNoticeList), kept by
 * the screen so they survive the list recycling its rows. Answers go to the
 * server one claim at a time (PATCH /api/claims/[id]) or all fictional ones
 * at once (acknowledge-fictional); the dashboard reloads once they settle.
 */
export function useNoticeAnswers(items: readonly NoticeItem[]): NoticeAnswersState {
  const claimAction = useClaimAction();
  const acknowledgeAll = useAcknowledgeFictional();
  const [answers, setAnswers] = useState<NoticeAnswers>({});
  const [busy, setBusy] = useState<Record<string, NoticeAnswerKind>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<BulkAcknowledgeState>(IDLE);
  const [showAll, setShowAll] = useState(false);
  const [visit, setVisit] = useState(0);
  // Taps arrive before the next render disables the buttons: guard them here.
  const inFlight = useRef(new Set<string>());
  const bulkInFlight = useRef(false);
  const latestItems = useRef(items);

  useEffect(() => {
    latestItems.current = items;
  }, [items]);

  const shown = visibleAnswers(answers, items, visit);
  const rows = mergeNoticeRows(items, shown);

  async function answer(item: NoticeItem, kind: NoticeAnswerKind) {
    const { claimId } = item;
    if (inFlight.current.has(claimId)) return;
    inFlight.current.add(claimId);
    const index = rows.findIndex((row) => row.claimId === claimId);
    setBusy((current) => ({ ...current, [claimId]: kind }));
    setErrors((current) => without(current, claimId));
    try {
      const { claim } = await claimAction.mutateAsync({
        claimId,
        body: kind === 'filed' ? { action: 'report_filed' } : { action: 'acknowledge_notice' },
      });
      const saved: NoticeAnswer = { claim, message: confirmationFor(item, kind), item, index, announce: true, visit };
      setAnswers((current) => ({ ...current, [claimId]: saved }));
    } catch (error) {
      setErrors((current) => ({ ...current, [claimId]: messageOf(error) }));
    } finally {
      inFlight.current.delete(claimId);
      setBusy((current) => without(current, claimId));
    }
  }

  async function acknowledgeAllFictional() {
    if (bulkInFlight.current) return;
    bulkInFlight.current = true;
    const before = rows;
    setBulk({ busy: true, error: null, done: null });
    // Closed-out rows show "Got it" answered, announced once by the summary instead of row by row.
    const closedOut = (claims: ClaimView[]) => {
      setAnswers((current) => {
        const next = { ...current };
        for (const claim of claims) {
          const index = before.findIndex((row) => row.claimId === claim.id);
          if (index < 0 || next[claim.id]) continue;
          next[claim.id] = { claim, message: notices.fictionalDone.text, item: before[index], index, announce: false, visit };
        }
        return next;
      });
      return claims.length > 0 ? closedOutMessage(claims.length) : null;
    };
    try {
      const claims = await acknowledgeAll.mutateAsync();
      setBulk({ busy: false, error: null, done: closedOut(claims) });
    } catch (error) {
      // Rows saved before the error still count as answered (CorrectiveNoticeList).
      setBulk({ busy: false, error: messageOf(error), done: closedOut(savedFictionalClaims(error)) });
    } finally {
      bulkInFlight.current = false;
    }
  }

  // Stable, so a focus effect can call it on blur without re-running.
  const endVisit = useCallback(() => {
    setVisit((current) => current + 1);
    setAnswers((current) => pruneAnswers(current, latestItems.current));
    setShowAll(false);
    setErrors({});
    setBulk((current) => (current.busy ? current : IDLE));
  }, []);

  return {
    rows,
    answers: shown,
    busy,
    errors,
    openFictional: openFictionalRows(rows, shown),
    bulk,
    showAll,
    revealAll: () => setShowAll(true),
    answer: (item, kind) => {
      void answer(item, kind);
    },
    numberSaved: (item, claim, message) => {
      setAnswers((current) => {
        const answered = current[item.claimId];
        return answered ? { ...current, [item.claimId]: { ...answered, claim, message, announce: true } } : current;
      });
    },
    acknowledgeAllFictional: () => {
      void acknowledgeAllFictional();
    },
    endVisit,
  };
}
