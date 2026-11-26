/**
 * Web-only, flag-aware disclaimers. src/lib/disclaimer.ts is shared with the
 * mobile app (mobile/shared.json) and must stay import-free, so the flag logic
 * lives here.
 */
import {
  APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER, LEGAL_DISCLAIMER, SHORT_DISCLAIMER,
} from '@/lib/disclaimer';
import { CLAIM_AGENT_LEGAL_SENTENCE, MAY_FILE_LEGAL_SENTENCE, MAY_FILE_SHORT_SENTENCE, lawsuitAiMayFile } from '@/lib/copy';
import { flags } from '@/lib/flags';

/* -------------------------------------------------------------------------- */
/* Flag-aware versions. With FEE_DISCLOSURE_ENABLED and ONE_CLICK_FILING_ENABLED
 * off (production today) these return the constants above word for word. When
 * Lawsuit AI may file (copy.ts lawsuitAiMayFile), only the filing sentence is
 * swapped; with the fee disclosed, "a free claim assistant" drops "free". */

const SELF_FILE_LEGAL_SENTENCE =
  'Lawsuit AI does not file, submit or sign claims for anyone, and it never receives or handles settlement payments.';
const SELF_FILE_SHORT_SENTENCE =
  'File free on the official site yourself, or use Easy submit on eligible claims and we submit it for you after you e-sign.';

function adapt(text: string, selfFile: string, mayFileText: string, mayFile: boolean, free: boolean): string {
  let out = mayFile ? text.replace(selfFile, mayFileText) : text;
  if (!free) out = out.replace('a free claim assistant', 'a claim assistant');
  return out;
}

export function legalDisclaimer(mayFile = lawsuitAiMayFile(), free = !flags.feeDisclosure()): string {
  return adapt(LEGAL_DISCLAIMER, SELF_FILE_LEGAL_SENTENCE, MAY_FILE_LEGAL_SENTENCE, mayFile, free);
}

export function shortDisclaimer(mayFile = lawsuitAiMayFile(), free = !flags.feeDisclosure()): string {
  return adapt(SHORT_DISCLAIMER, SELF_FILE_SHORT_SENTENCE, MAY_FILE_SHORT_SENTENCE, mayFile, free);
}

export function appLegalDisclaimer(mayFile = lawsuitAiMayFile(), free = !flags.feeDisclosure()): string {
  return adapt(APP_LEGAL_DISCLAIMER, SELF_FILE_LEGAL_SENTENCE, MAY_FILE_LEGAL_SENTENCE, mayFile, free);
}

export function appShortDisclaimer(mayFile = lawsuitAiMayFile(), free = !flags.feeDisclosure()): string {
  return adapt(APP_SHORT_DISCLAIMER, SELF_FILE_SHORT_SENTENCE, MAY_FILE_SHORT_SENTENCE, mayFile, free);
}

/**
 * The legal disclaimer for one claim page (go-live checklist item 13). When
 * Lawsuit AI files this claim (`filesThisClaim`: one-click on and an agent
 * lane the law firm enabled, from claimFiledByLawsuitAi), the filing sentence
 * says so for this claim; otherwise it is legalDisclaimer() word for word.
 */
export function claimLegalDisclaimer(
  filesThisClaim: boolean,
  oneClickOn = flags.oneClickFiling(),
  free = !flags.feeDisclosure(),
): string {
  if (!filesThisClaim || !oneClickOn) return legalDisclaimer(undefined, free);
  return adapt(LEGAL_DISCLAIMER, SELF_FILE_LEGAL_SENTENCE, CLAIM_AGENT_LEGAL_SENTENCE, true, free);
}

/** Per-claim disclaimer for the native app (same rule as claimLegalDisclaimer, app wording). */
export function claimAppLegalDisclaimer(
  filesThisClaim: boolean,
  oneClickOn = flags.oneClickFiling(),
  free = !flags.feeDisclosure(),
): string {
  if (!filesThisClaim || !oneClickOn) return appLegalDisclaimer(undefined, free);
  return adapt(APP_LEGAL_DISCLAIMER, SELF_FILE_LEGAL_SENTENCE, CLAIM_AGENT_LEGAL_SENTENCE, true, free);
}
