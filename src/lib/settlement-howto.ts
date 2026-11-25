/**
 * How-to-file steps and HowTo JSON-LD for a settlement page.
 * Wording matches the visible "How to file" section and SETTLEMENT_FILING_COPY.
 * "We file this claim for you" is used only in the agent lane (one-click enabled
 * for that settlement).
 */
import { SETTLEMENT_FILING_COPY, type SettlementFilingMode } from './copy';
import { pageUrl, settlementMetaDescription, settlementPath } from './settlement-seo';
import type { Lawsuit } from './types';

export interface HowToStep {
  name: string;
  text: string;
}

const QUALIFY: HowToStep = {
  name: 'Check that you qualify',
  text: 'Read the official notice. It has the exact rules and the deadline.',
};

const NEVER_FILES: HowToStep = {
  name: 'File on the official site yourself',
  text: 'Filing is free. Lawsuit AI never files for you and never handles settlement payments.',
};

const TRACK: HowToStep = {
  name: 'Keep track in Lawsuit AI',
  text: 'Tell us when you’ve filed and save the confirmation number the official site gives you.',
};

export function settlementHowToSteps(mode: SettlementFilingMode): HowToStep[] {
  const mid: HowToStep =
    mode === 'never_files'
      ? NEVER_FILES
      : {
          name: SETTLEMENT_FILING_COPY[mode].step.title,
          text: SETTLEMENT_FILING_COPY[mode].step.body,
        };
  return [QUALIFY, mid, TRACK];
}

export function settlementHowToJsonLd(lawsuit: Lawsuit, mode: SettlementFilingMode) {
  const steps = settlementHowToSteps(mode);
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to file a claim for the ${lawsuit.title.trim()}`,
    description: settlementMetaDescription(lawsuit),
    url: pageUrl(settlementPath(lawsuit.slug)),
    step: steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}
