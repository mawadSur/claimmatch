/**
 * Checkable public trust facts for home, settlement pages, signup, and FAQ.
 * Every sentence must stay literally true of the product today. Never invent
 * user counts, reviews, testimonials, or a last-checked date that was not
 * reviewed.
 */

import {
  FILE_FREE_DIRECTLY,
  NEVER_CHARGE_UPFRONT,
  NO_SSN_OR_BANK_TO_MATCH,
  OPERATOR_LEGAL_NAME,
  PUBLIC_CONTACT_EMAIL,
  TRUST_FACTS_CHECKED_ON,
  WHAT_WE_STORE_MINIMAL,
  WE_FILE_SUPPORTED_SENTENCE,
  accountGateWhy,
  feeEveryClaimCopy,
  lawsuitAiMayFile,
  operatorLine,
  publicBetaFeeCopy,
} from './copy';
import { flags } from './flags';
import { formatDeadline } from './utils';

export const IS_LAWSUIT_AI_LEGIT_Q = 'Is Lawsuit AI legit?';

export function howWeMakeMoneyFact(disclose = flags.feeDisclosure()): string {
  return disclose
    ? feeEveryClaimCopy()
    : `${publicBetaFeeCopy()} ${NEVER_CHARGE_UPFRONT} We don’t run ads or sell paid plans today, and we do not sell your personal information.`;
}

export function isLawsuitAiLegitAnswer(
  disclose = flags.feeDisclosure(),
  mayFile = lawsuitAiMayFile(),
): string {
  const filing = mayFile
    ? WE_FILE_SUPPORTED_SENTENCE
    : 'You file every claim yourself on the official settlement website.';
  return (
    `Yes. ${operatorLine(OPERATOR_LEGAL_NAME)} ${howWeMakeMoneyFact(disclose)} ` +
    `${filing} ${FILE_FREE_DIRECTLY} Every settlement listing links to its official ` +
    `administrator site when we have that URL. ${NO_SSN_OR_BANK_TO_MATCH} ` +
    `${WHAT_WE_STORE_MINIMAL} Read the Privacy Policy for the full list. ` +
    `Questions: ${PUBLIC_CONTACT_EMAIL}.`
  );
}

export function trustFactsCheckedLabel(): string {
  const formatted = formatDeadline(TRUST_FACTS_CHECKED_ON);
  return formatted === 'Varies' ? '' : `These facts were last checked on ${formatted}.`;
}

export function dataHandlingSummary(): string {
  return `${WHAT_WE_STORE_MINIMAL} ${NO_SSN_OR_BANK_TO_MATCH}`;
}

export function whyAccountPoints(mayFile = lawsuitAiMayFile()): string[] {
  return [
    'See matched settlements and open the official claim form with no account.',
    FILE_FREE_DIRECTLY,
    accountGateWhy(mayFile),
  ];
}
