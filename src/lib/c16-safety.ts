/**
 * C16 safety checks for E3, E4 and E7.
 *
 * These gstack items are not in the Brief 3 build. E3 and E4 need counsel
 * and security review (checklist B4). E7 needs partner discovery calls.
 * This file is the spec stub plus the fail-closed gates: nothing here tells
 * a user they qualify, fills an official form, or serves a partner embed.
 *
 * Each surface is also behind its own env flag (off unless exactly "1").
 * Flipping a flag does not ship the feature — the catalogs stay empty and
 * the helpers still refuse to emit a verdict, bookmarklet, or widget.
 */

import { flags } from './flags';

export const C16_BLOCKERS = {
  e3: 'Counsel and security review (checklist B4) before settlement-specific eligibility questions or any qualify verdict.',
  e4: 'Counsel and security review (checklist B4) before any official-form autofill extension or bookmarklet.',
  e7: 'Partner discovery calls before any embeddable partner widget.',
} as const;

/** E3 spec stub: a per-settlement question. None ship until B4. */
export interface SettlementEligibilityQuestion {
  settlementSlug: string;
  key: string;
  prompt: string;
}

/** Empty on purpose — the top-10 question bank is not built. */
export const SETTLEMENT_ELIGIBILITY_QUESTIONS: readonly SettlementEligibilityQuestion[] = [];

export type EligibilityVerdictKind = 'qualify' | 'not_qualify';

export interface EligibilityVerdictResult {
  offered: boolean;
  verdict: EligibilityVerdictKind | null;
  message: string;
}

/** Questions for one settlement. Always empty until a reviewed bank exists. */
export function settlementEligibilityQuestions(
  slug: string,
  enabled = flags.eligibilityQuestions(),
): SettlementEligibilityQuestion[] {
  if (!enabled) return [];
  const needle = slug.trim().toLowerCase();
  if (!needle) return [];
  return SETTLEMENT_ELIGIBILITY_QUESTIONS.filter((q) => q.settlementSlug === needle);
}

/**
 * Never returns qualify / not_qualify. The matcher score in matching.ts stays
 * internal (D50) and is not a public verdict.
 */
export function eligibilityVerdict(
  _input: { slug?: string; answers?: Record<string, unknown> } = {},
  _enabled = flags.eligibilityQuestions(),
): EligibilityVerdictResult {
  return {
    offered: false,
    verdict: null,
    message: C16_BLOCKERS.e3,
  };
}

/** E4: never emit a bookmarklet, even when FORM_AUTOFILL_ENABLED=1. */
export function officialFormAutofillBookmarklet(
  enabled = flags.formAutofill(),
): string | null {
  if (!enabled) return null;
  return null;
}

/** E4: never emit a page-injected official-form fill script. */
export function officialFormAutofillScript(
  enabled = flags.formAutofill(),
): string | null {
  if (!enabled) return null;
  return null;
}

/** E7: never emit embeddable partner HTML or JS. */
export function partnerWidgetSnippet(
  enabled = flags.partnerWidget(),
): string | null {
  if (!enabled) return null;
  return null;
}

/** E7: the widget is not offered, even when the flag is on. */
export function partnerWidgetAllowed(
  _enabled = flags.partnerWidget(),
): boolean {
  return false;
}
