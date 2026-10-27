import { cleanSearchTerm } from './lawsuits';
import type { Lawsuit } from './types';

export const NOTICE_LOOKUP_LIMIT = 5;

export const NOTICE_NOT_FOUND =
  "We couldn't find this. That doesn't mean it's fake or real. Check the official notice and the court docket.";

export const NOTICE_LOOKUP_PROMPT =
  'Settlement name, administrator, or claim ID from your notice';

type Scored = { row: Lawsuit; score: number };

/**
 * Rank catalog rows for a pasted notice. Internal ranking only — callers never
 * show a score or a scam/legit verdict. Matches title, administrator,
 * external/claim id, and the official URL.
 */
export function rankNoticeMatches<T extends Pick<Lawsuit, 'title' | 'administrator' | 'external_id' | 'claim_url'>>(
  query: string,
  rows: readonly T[],
  limit = NOTICE_LOOKUP_LIMIT,
): T[] {
  const term = cleanSearchTerm(query);
  if (!term) return [];
  const needle = term.toLowerCase();
  const words = needle.split(' ').filter(Boolean);
  const scored: Scored[] = [];

  for (const row of rows) {
    const title = row.title.toLowerCase();
    const admin = (row.administrator ?? '').toLowerCase();
    const external = (row.external_id ?? '').toLowerCase();
    const claimUrl = (row.claim_url ?? '').toLowerCase();
    const haystack = `${title} ${admin} ${external}`;

    let score = 0;
    if (external && (external === needle || external.includes(needle))) score += 100;
    if (needle.length >= 4 && claimUrl.includes(needle)) score += 80;
    if (title === needle) score += 70;
    else if (title.includes(needle)) score += 40;
    if (words.length > 0 && words.every((w) => title.includes(w))) score += 20;
    if (admin && (admin === needle || admin.includes(needle))) score += 30;
    if (words.length > 0 && words.every((w) => haystack.includes(w))) score += 10;
    if (score <= 0) continue;
    scored.push({ row: row as Lawsuit, score });
  }

  scored.sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title));
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.row as T);
}
