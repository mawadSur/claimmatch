/**
 * How-to-file steps and HowTo JSON-LD for a settlement page.
 * Wording matches the visible "How to file" section and guideFilingCopy.
 * "We file this claim for you" is used only when filingMode is agent.
 */
import { guideFilingCopy, type SettlementFilingMode } from './copy';
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

const TRACK: HowToStep = {
  name: 'Keep track in Lawsuit AI',
  text: 'Tell us when you’ve filed and save the confirmation number the official site gives you.',
};

export function settlementHowToSteps(mode: SettlementFilingMode): HowToStep[] {
  const mid = guideFilingCopy(mode).step;
  return [QUALIFY, { name: mid.title, text: mid.body }, TRACK];
}

export function settlementHowToJsonLd(lawsuit: Lawsuit, mode: SettlementFilingMode) {
  const steps = settlementHowToSteps(mode);
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to file a claim for the ${lawsuit.title.trim()}`,
    description: settlementMetaDescription(lawsuit, mode),
    url: pageUrl(settlementPath(lawsuit.slug)),
    step: steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}
