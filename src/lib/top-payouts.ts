import { finitePayoutAmount } from './owed-estimate';
import type { Lawsuit } from './types';

/** The payout fields a row may carry: the prose the card shows, plus the curated columns. */
export type PayoutColumns = Partial<Pick<Lawsuit, 'typical_payout' | 'payout_min' | 'payout_max'>>;

type TopPayoutRow = Pick<Lawsuit, 'id' | 'title' | 'deadline'> & PayoutColumns;

/**
 * No per-person claim amount in this catalog comes near $50,000: the largest
 * genuine figures are documented-loss caps of $5,000. Settlement funds, civil
 * penalties and class-wide totals all run far above it, so an amount at or
 * above this ceiling is a pot of money and never one person's payout. Without
 * it "$359,925,000 settlement fund" read as the top per-person payout on the
 * home page, because only word-suffixed totals ("$5 million") were skipped.
 */
export const PER_PERSON_CEILING = 50_000;

/** Characters of neighbouring text read to decide whether an amount is a fund. */
const CONTEXT = 48;

// "$1,200", "$ 25.50", "$0.50"; group 2 catches "$5 million" / "$2.3B".
const DOLLAR = /\$\s*([\d,]+(?:\.\d+)?)(\s*(?:million|billion|mil|bn|[mb])\b)?/gi;

/**
 * Words directly after an amount that make it a pot of money rather than a
 * payout: "$122,500 Settlement Fund", "$175,000,000.00 civil money penalty",
 * "three $500,000 pools", "$15,000.00 service award" (paid to the named
 * plaintiff, not to the class).
 */
const FUND_AFTER =
  /^[\s,.:;)]*(?:(?:gross|net|qualified|common|fair|damages|reserve|escrow|guaranteed\s+payments)\s+)*(?:settlement\s+)?(?:civil\s+money\s+penalty|settlement\s+amount|settlement\s+for\b|(?:service|incentive|case\s+contribution|cy\s+pres)\s+awards?|in\s+attorneys|in\s+cash\s+and\s+credits|in\s+payments\b|funds?\b|penalty\b|pools?\b|escrow\b|reserve\b|settlement\s+will\s+be\s+(?:divided|allocated|distributed)|will\s+be\s+(?:divided|allocated|distributed)\s+among)/i;

/**
 * Phrases that have to sit immediately before an amount for it to be a pot:
 * "a fund of up to $3,840,664", "agreed to pay $1,000,000.00", "share of a
 * $4,500,000 fund", "notional value of $16,766,642.00". Anchored to the end of
 * the window, so in "From a $9,000,000 settlement fund: $0.50 per covered
 * product" the $0.50 is still read as the real payout.
 */
const FUND_BEFORE =
  /(?:\b(?:funds?|penalty|pools?|escrow|reserve|settlement\s+amount|settlement|value|total)\s+of|\bshare\s+of)(?:\s+up\s+to)?\s+(?:an?|the)?\s*$/i;

/**
 * Largest per-person dollar amount stated in the payout text a card shows, or
 * null when the text states none. Only "$"-prefixed numbers count, so years,
 * months and quantities never do. Three kinds of number are thrown out: totals
 * written in words ("$5 million"), anything at or above PER_PERSON_CEILING,
 * and anything whose neighbouring words mark it as a fund, penalty, pool or
 * service award. A tiny amount is still an amount: "$0.50" is 0.5.
 */
export function statedDollarPayout(text: string | null | undefined): number | null {
  if (!text) return null;
  const amounts: number[] = [];
  for (const match of text.matchAll(DOLLAR)) {
    if (match[2] !== undefined) continue;
    const amount = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount >= PER_PERSON_CEILING) continue;
    const at = match.index ?? 0;
    const end = at + match[0].length;
    if (FUND_BEFORE.test(text.slice(Math.max(0, at - CONTEXT), at))) continue;
    if (FUND_AFTER.test(text.slice(end, end + CONTEXT))) continue;
    amounts.push(amount);
  }
  return amounts.length ? Math.max(...amounts) : null;
}

/**
 * The listing's own per-person payout figure, or null when it states none.
 * payout_max / payout_min are curated per-person columns (the same figures the
 * dashboard's listed-payout copy shows), so they are trusted ahead of a regex
 * read of prose; a column holding a fund total is rejected by the same
 * plausibility ceiling. Falls back to the amount stated in the payout text.
 */
export function perPersonPayout(row: PayoutColumns): number | null {
  for (const value of [row.payout_max, row.payout_min]) {
    const amount = finitePayoutAmount(value);
    if (amount != null && amount > 0 && amount < PER_PERSON_CEILING) return amount;
  }
  return statedDollarPayout(row.typical_payout);
}

/**
 * What the home page's biggest-payout module may rank a card by. Null unless
 * the payout text the card shows states a per-person amount, so the module can
 * never put a card that states no amount at the top — the exact fault the live
 * site had. Once a row qualifies, perPersonPayout picks the figure.
 */
export function rankablePayout(row: PayoutColumns): number | null {
  if (statedDollarPayout(row.typical_payout) == null) return null;
  return perPersonPayout(row);
}

/**
 * Choose the rows for the home page's "Top open settlements" module: rows
 * whose displayed payout text states a per-person dollar amount, highest
 * first, then sooner deadline, then title. Rows with no stated amount are left
 * out, never guessed, and a fund total is never substituted for one — so when
 * no row states a genuine per-person figure this returns nothing and the
 * module can be hidden rather than ranked on the wrong axis.
 *
 * This only orders and trims. Whether a settlement is open for claims is the
 * shared catalog rule applied by lookupLawsuits(); this function never decides it.
 */
export function pickTopPayouts<T extends TopPayoutRow>(rows: readonly T[], limit = 5): T[] {
  return rows
    .map((row) => ({ row, amount: rankablePayout(row) }))
    .filter((entry): entry is { row: T; amount: number } => entry.amount != null)
    .sort((a, b) => {
      if (a.amount !== b.amount) return b.amount - a.amount;
      if (a.row.deadline && b.row.deadline && a.row.deadline !== b.row.deadline) {
        return a.row.deadline.localeCompare(b.row.deadline);
      }
      if (a.row.deadline && !b.row.deadline) return -1;
      if (!a.row.deadline && b.row.deadline) return 1;
      return a.row.title.localeCompare(b.row.title);
    })
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((entry) => entry.row);
}
