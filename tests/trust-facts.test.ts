import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: () => undefined }),
}));
import {
  FILE_FREE_DIRECTLY,
  NEVER_CHARGE_UPFRONT,
  NO_SSN_OR_BANK_TO_MATCH,
  OPERATOR_JURISDICTION,
  OPERATOR_LEGAL_NAME,
  PUBLIC_CONTACT_EMAIL,
  accountGateWhy,
  operatorLine,
} from '@/lib/copy';
import {
  IS_LAWSUIT_AI_LEGIT_Q,
  howWeMakeMoneyFact,
  isLawsuitAiLegitAnswer,
  trustFactsCheckedLabel,
} from '@/lib/trust-facts';
import { homeFaqItems } from '@/components/home/HomeFaq';
import { PublicTrustBlock } from '@/components/PublicTrustBlock';
import { FileFreeDirectly } from '@/components/FileFreeDirectly';
import { WhyAccountExplainer } from '@/components/WhyAccountExplainer';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public trust facts', () => {
  it('names the operator, contact, and match limits without a 15% fee when disclosure is off', () => {
    expect(OPERATOR_LEGAL_NAME).toBe('Lawsuit AI LLC');
    expect(OPERATOR_JURISDICTION).toBe('Wyoming');
    expect(PUBLIC_CONTACT_EMAIL).toBe('hello@lawsuitai.org');
    expect(operatorLine()).toContain('Lawsuit AI LLC');
    expect(operatorLine()).toContain('Wyoming');
    expect(howWeMakeMoneyFact(false)).toContain(NEVER_CHARGE_UPFRONT);
    expect(howWeMakeMoneyFact(false)).not.toMatch(/15\s*%|15 percent/i);
    expect(howWeMakeMoneyFact(true)).toMatch(/15 percent/);
    const answer = isLawsuitAiLegitAnswer(false, false);
    expect(answer).toContain('Lawsuit AI LLC');
    expect(answer).toContain(FILE_FREE_DIRECTLY);
    expect(answer).toContain(NO_SSN_OR_BANK_TO_MATCH);
    expect(answer).toContain(PUBLIC_CONTACT_EMAIL);
    expect(answer).not.toMatch(/15\s*%|15 percent/i);
    expect(trustFactsCheckedLabel()).toMatch(/last checked on/i);
  });

  it('asks for an account only to save, remind, or file when filing is on', () => {
    expect(accountGateWhy(false)).toBe('Create an account only to save matches or get deadline alerts.');
    expect(accountGateWhy(true)).toMatch(/have us file on supported settlements/);
  });

  it('puts the legit FAQ first and emits FAQPage JSON-LD from the home FAQ', () => {
    const items = homeFaqItems(false, false);
    expect(items[0]?.q).toBe(IS_LAWSUIT_AI_LEGIT_Q);
    expect(items[0]?.a).toContain('Lawsuit AI LLC');
  });
});

describe('trust surfaces', () => {
  it('renders the trust block with checkable facts and no 15% when the flag is off', () => {
    const html = renderToStaticMarkup(createElement(PublicTrustBlock));
    expect(html).toContain('Is Lawsuit AI legit?');
    expect(html).toContain('Lawsuit AI LLC');
    expect(html).toContain('hello@lawsuitai.org');
    expect(html).toContain('/privacy');
    expect(html).toContain(NO_SSN_OR_BANK_TO_MATCH);
    expect(html).not.toMatch(/15\s*%|15 percent/i);
  });

  it('tells visitors they can file free on the official site', () => {
    const html = renderToStaticMarkup(
      createElement(FileFreeDirectly, {
        official: {
          kind: 'official',
          href: 'https://www.example-settlement.test/submit-claim',
          host: 'example-settlement.test',
          label: 'Official site',
        },
        lawsuitId: '00000000-0000-4000-8000-000000000001',
        slug: 'example-settlement',
      }),
    );
    expect(html).toContain(FILE_FREE_DIRECTLY);
    expect(html).toContain('https://www.example-settlement.test/submit-claim');
    expect(html).toContain('File on the official site');
  });

  it('explains why an account exists at the signup gate', () => {
    const html = renderToStaticMarkup(createElement(WhyAccountExplainer));
    expect(html).toContain('Why an account?');
    expect(html).toContain('no account');
    expect(html).toContain(FILE_FREE_DIRECTLY);
  });
});
