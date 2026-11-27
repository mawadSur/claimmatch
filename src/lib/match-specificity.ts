/**
 * How specific a settlement's class actually is, for MATCH_SPECIFICITY_GATE_ENABLED.
 *
 * `eligibility.requires = ['employed_hourly']` is one coarse user boolean
 * ("Have you worked an hourly or gig job in the last 4 years?"), so without
 * these checks an HOURLY NON-EXEMPT class at one named employer scored
 * 0.5 + (1/1) * 0.5 = 1.0 — a "Strong match" — for anyone who answered yes.
 * The employer, the role and the class period were all in the row and were
 * only ever a bonus.
 *
 * Pure, relative imports only: src/lib/matching.ts is in mobile/shared.json,
 * so everything it reaches must be too (tests/mobile-shared-purity.test.ts).
 */
import { employersFromLawsuit, sourceText, validIsoDate } from './lawsuit-tags';
import type { EligibilityCriteria, LawsuitTags } from './types';

/**
 * Wording that scopes a class to one employer or to a specific role, rather
 * than to an industry.
 */
const EMPLOYER_BOUNDED_RE =
  /\bemployees of\b|\bwho worked (?:at|for)\b|\bemployed by\b|\bnon-?exempt\b/i;

/** Escape hatch: the same vocabulary used for an industry-wide or nationwide class. */
const INDUSTRY_WIDE_RE =
  /\ball (?:current and former )?(?:hourly|non-?exempt) (?:employees|workers)\b(?!\s+of\b)|\bnationwide\b|\ball 50 states\b/i;

/** Tag/fact names shorter than this only ever match an exact, equal string. */
export const MIN_FUZZY_TAG_LENGTH = 3;

/**
 * Ceiling for an eligible row whose class period is bounded but whose profile
 * has no dated facts at all: it can be a Possible match, never a Strong one.
 * Must stay below STRONG_MATCH_SCORE_THRESHOLD after the toFixed(2) rounding,
 * so 0.74 rather than 0.75.
 */
export const DATE_BOUNDED_FACTLESS_SCORE_CAP = 0.74;

/** The listing fields the matcher reads as free text. */
export interface SpecificitySource {
  tags?: unknown;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  eligibility_text?: string | null;
  eligibility?: EligibilityCriteria | null;
}

/**
 * True when the class is scoped to a named employer or to a specific role.
 * `tags.employers` wins; otherwise the listing text is read, because tags are
 * written only at ingest and a later eligibility-draft approval leaves them
 * null. Industry-wide wording turns the text signal back off, so the gate does
 * not become a blanket ban on wage settlements.
 */
export function classIsEmployerBounded(lawsuit: SpecificitySource): boolean {
  const employers = employersFromLawsuit(lawsuit);
  if (employers && employers.length > 0) return true;
  const text = sourceText(lawsuit);
  if (!text.trim()) return false;
  return EMPLOYER_BOUNDED_RE.test(text) && !INDUSTRY_WIDE_RE.test(text);
}

/**
 * Class period from tags, falling back to `eligibility.dateRange`, which the
 * matcher never consulted before (it was read only at ingest).
 */
export function classPeriod(
  lawsuit: SpecificitySource,
  tags: LawsuitTags,
): { start: string | null; end: string | null } {
  const range = lawsuit.eligibility?.dateRange;
  return {
    start: tags.class_period_start ?? validIsoDate(range?.from),
    end: tags.class_period_end ?? validIsoDate(range?.to),
  };
}

export function classIsDateBounded(lawsuit: SpecificitySource, tags: LawsuitTags): boolean {
  const period = classPeriod(lawsuit, tags);
  return Boolean(period.start || period.end);
}

/** Whole-word containment, the same shape lawsuit-tags.ts uses for brands. */
export function wordContains(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(text);
}

/**
 * Whether a profile fact corroborates a lawsuit tag under the gate: exact, or
 * whole-word containment in either direction once both strings are long enough.
 * "Acme Logistics" still matches "Acme Logistics, Inc."; a two-character fact
 * no longer matches an unrelated employer or brand.
 */
export function tagMatchesFactStrictly(needle: string, hay: string): boolean {
  if (hay === needle) return true;
  if (needle.length < MIN_FUZZY_TAG_LENGTH || hay.length < MIN_FUZZY_TAG_LENGTH) return false;
  return wordContains(hay, needle) || wordContains(needle, hay);
}
