/**
 * Which open settlements are easiest for a person to actually finish: the ones
 * whose official path does not ask for a mailed notice ID or PIN, and whose
 * class is a data breach (the broadest, lowest-proof cohort).
 *
 * Ordering only. Nothing here changes a match score, and nothing here asserts
 * to a person that a settlement needs no ID — the catalog's audit notes say
 * some desk_file paths may still ask for one.
 *
 * Pure, relative imports only: the native app imports this file through
 * components/claims/dashboard-model.ts, so '@/' would point at the app's own
 * src (see mobile/shared.json and tests/mobile-shared-purity.test.ts).
 */
import { slugify } from './utils';

/**
 * lawsuits.claim_action_type values whose official path is reachable without a
 * mailed notice ID. `needs_notice_id`, `mail_in`, `automatic_payment` and
 * `not_open` are not. Null and undefined are NOT no-PIN: migration 0051 may
 * not be applied, and `lookupLawsuits()` selects `*`, so a missing column
 * silently yields undefined for every row.
 */
export const NO_PIN_CLAIM_ACTION_TYPES = ['desk_file', 'online_form'] as const;

const NO_PIN_SET: ReadonlySet<string> = new Set(NO_PIN_CLAIM_ACTION_TYPES);

export function isNoPinClaimAction(type: string | null | undefined): boolean {
  if (typeof type !== 'string') return false;
  return NO_PIN_SET.has(type.trim());
}

/**
 * Easy submit / “We file this claim for you”: lawsuits.claim_action_type is
 * `desk_file`. Public pages still require an approved spec + policy; ranking
 * only uses the stored type so a dashboard sort cannot depend on a spec read.
 */
export function isWeFileClaimAction(type: string | null | undefined): boolean {
  return type === 'desk_file';
}

/**
 * Category slugs that carry breach classes. `lawsuits.category` is free text
 * with no DB constraint, and breach cases are filed under 'Data Breach' and
 * 'Privacy' (which src/lib/matching.ts also maps to `had_data_breach`), so
 * this is a set, never an equality test.
 */
export const BREACH_CATEGORY_SLUGS = ['data-breach', 'privacy'] as const;

const BREACH_SLUG_SET: ReadonlySet<string> = new Set(BREACH_CATEGORY_SLUGS);

/**
 * Breach wording, for rows mis-filed under 'Health & Pharma' or 'General'.
 * Deliberately narrower than the matcher's keyword pattern: no bare
 * "exposed", which fires on unrelated consumer listings.
 */
const BREACH_TEXT_RE = /\bdata[\s-]+breach\b|\bbreach(?:ed|es)?\b|\bpersonal information\b/i;

export function isBreachCategory(category: string | null | undefined): boolean {
  if (typeof category !== 'string') return false;
  const slug = slugify(category);
  return slug.length > 0 && BREACH_SLUG_SET.has(slug);
}

export interface ClaimPriorityRow {
  claim_action_type?: string | null;
  category?: string | null;
  title?: string | null;
  summary?: string | null;
}

/** A breach class by category, or by unambiguous breach wording in the listing. */
export function isBreachSettlement(row: ClaimPriorityRow): boolean {
  if (isBreachCategory(row.category)) return true;
  const text = [row.title, row.summary]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  return text.length > 0 && BREACH_TEXT_RE.test(text);
}

/**
 * 0 = no PIN needed AND a breach class, 1 = no PIN needed, 2 = everything
 * else. Lower sorts first. A row with no known claim_action_type always
 * returns 2, so the rank is a clean no-op before 0051 is applied.
 */
export function noPinBreachRank(row: ClaimPriorityRow): 0 | 1 | 2 {
  if (!isNoPinClaimAction(row.claim_action_type)) return 2;
  return isBreachSettlement(row) ? 0 : 1;
}
