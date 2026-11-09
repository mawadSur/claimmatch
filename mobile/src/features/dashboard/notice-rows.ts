import type { NoticeItem } from '@shared/components/claims/dashboard-model';
import type { ClaimView } from '@shared/lib/claims';

/** One answer given on the dashboard's corrective notice during this visit. */
export interface NoticeAnswer {
  /** The claim as the server answered with it. */
  claim: ClaimView;
  /** The confirmation shown in place of the buttons. */
  message: string;
  /** The row as it was shown when answered, kept after the server drops it. */
  item: NoticeItem;
  /** Its place in the list then, so it stays put. */
  index: number;
  /** False for rows answered by "Got it for all": one summary is announced instead. */
  announce: boolean;
  /** The visit it was given in (a visit ends when the screen loses focus or is pulled to refresh). */
  visit: number;
}

export type NoticeAnswers = Readonly<Record<string, NoticeAnswer>>;

/**
 * The answers to show in this visit: all of this visit's, and an earlier
 * visit's only while the server still lists its row (its reload is pending),
 * so the row shows the confirmation rather than its buttons again.
 */
export function visibleAnswers(answers: NoticeAnswers, items: readonly NoticeItem[], visit: number): NoticeAnswers {
  const present = new Set(items.map((item) => item.claimId));
  const shown: Record<string, NoticeAnswer> = {};
  for (const [claimId, answer] of Object.entries(answers)) {
    if (answer.visit === visit || present.has(claimId)) shown[claimId] = answer;
  }
  return shown;
}

/**
 * The rows to show: the server's latest notices, plus the rows answered
 * during this visit that the server has since dropped, each back in the place
 * it had. The web keeps the first list until the page is left
 * (CorrectiveNoticeList); here the list still follows the server, and only
 * answered rows are held, so a reload never brings back a row's buttons.
 */
export function mergeNoticeRows(items: readonly NoticeItem[], answers: NoticeAnswers): NoticeItem[] {
  const present = new Set(items.map((item) => item.claimId));
  const kept = Object.values(answers)
    .filter((answer) => !present.has(answer.item.claimId))
    .sort((a, b) => a.index - b.index);
  const rows = [...items];
  for (const answer of kept) rows.splice(Math.min(answer.index, rows.length), 0, answer.item);
  return rows;
}

/** At the end of a visit: forget the answers whose rows the server has dropped. */
export function pruneAnswers(answers: NoticeAnswers, items: readonly NoticeItem[]): NoticeAnswers {
  const present = new Set(items.map((item) => item.claimId));
  const next: Record<string, NoticeAnswer> = {};
  let dropped = false;
  for (const [claimId, answer] of Object.entries(answers)) {
    if (present.has(claimId)) next[claimId] = answer;
    else dropped = true;
  }
  return dropped ? next : answers;
}

/** Fictional rows still waiting for "Got it". */
export function openFictionalRows(rows: readonly NoticeItem[], answers: NoticeAnswers): NoticeItem[] {
  return rows.filter((row) => row.kind === 'fictional' && !answers[row.claimId]);
}
