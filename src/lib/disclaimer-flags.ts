/**
 * Web-only, flag-aware disclaimers. src/lib/disclaimer.ts is shared with the
 * mobile app (mobile/shared.json) and must stay import-free, so the flag logic
 * lives here.
 */
import {
  APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER, LEGAL_DISCLAIMER, SHORT_DISCLAIMER,
} from '@/lib/disclaimer';
import { MAY_FILE_LEGAL_SENTENCE, MAY_FILE_SHORT_SENTENCE, lawsuitAiMayFile } from '@/lib/copy';
import { flags } from '@/lib/flags';

/* -------------------------------------------------------------------------- */
/* Flag-aware versions. With FEE_DISCLOSURE_ENABLED and ONE_CLICK_FILING_ENABLED
 * off (production today) these return the constants above word for word. When
 * Lawsuit AI may file (copy.ts lawsuitAiMayFile), only the filing sentence is
 * swapped; with the fee disclosed, "a free claim assistant" drops "free". */

const SELF_FILE_LEGAL_SENTENCE =
  'Lawsuit AI does not file, submit or sign claims for anyone, and it never receives or handles settlement payments.';
const SELF_FILE_SHORT_SENTENCE = 'You file every claim yourself on the official settlement website.';

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
