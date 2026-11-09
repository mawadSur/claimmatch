import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLawsuit } from './helpers';
import {
  ACCOUNT_FOR_SAVE_WHY,
  BETA_FEE_COPY,
  BROWSE_NO_ACCOUNT,
  NEUTRAL_BETA_FEE_COPY,
  WHAT_WE_STORE_MINIMAL,
  publicBetaFeeCopy,
} from '@/lib/copy';
import { flags } from '@/lib/flags';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { filterCatalog, sortCatalogValueFirst } from '@/lib/catalog-page';
import { eligibilityQuizPrompts, eligibilityQuizResultCopy } from '@/lib/settlement-quiz';
import { settlementAnswerFacts } from '@/lib/settlement-seo';
import { AnswerBlock } from '@/components/settlement/AnswerBlock';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('panel-trust flags default off', () => {
  it('turns on only when the env var is exactly 1', () => {
    expect(flags.panelTrustCopy()).toBe(false);
    expect(flags.catalogValueRank()).toBe(false);
    expect(flags.settlementQuiz()).toBe(false);
    vi.stubEnv('PANEL_TRUST_COPY_ENABLED', 'true');
    vi.stubEnv('CATALOG_VALUE_RANK_ENABLED', 'yes');
    vi.stubEnv('SETTLEMENT_QUIZ_ENABLED', 'on');
    expect(flags.panelTrustCopy()).toBe(false);
    expect(flags.catalogValueRank()).toBe(false);
    expect(flags.settlementQuiz()).toBe(false);
    vi.stubEnv('PANEL_TRUST_COPY_ENABLED', '1');
    vi.stubEnv('CATALOG_VALUE_RANK_ENABLED', '1');
    vi.stubEnv('SETTLEMENT_QUIZ_ENABLED', '1');
    expect(flags.panelTrustCopy()).toBe(true);
    expect(flags.catalogValueRank()).toBe(true);
    expect(flags.settlementQuiz()).toBe(true);
  });
});

describe('neutral beta fee copy', () => {
  it('keeps the current beta line until the trust-copy flag is on', () => {
    expect(publicBetaFeeCopy()).toBe(BETA_FEE_COPY);
    expect(BETA_FEE_COPY).toContain('We may introduce a fee later');
    vi.stubEnv('PANEL_TRUST_COPY_ENABLED', '1');
    expect(publicBetaFeeCopy()).toBe(NEUTRAL_BETA_FEE_COPY);
    expect(NEUTRAL_BETA_FEE_COPY).toBe(
      'Free during beta. Any future pricing will be shown before you use it.',
    );
  });
});

describe('no-account browse copy', () => {
  it('says browsing and the official form need no account, and why an account exists', () => {
    expect(BROWSE_NO_ACCOUNT).toMatch(/no account/i);
    expect(BROWSE_NO_ACCOUNT.toLowerCase()).toContain('official');
    expect(ACCOUNT_FOR_SAVE_WHY).toMatch(/save matches/i);
    expect(ACCOUNT_FOR_SAVE_WHY.toLowerCase()).toContain('alert');
    expect(WHAT_WE_STORE_MINIMAL.toLowerCase()).toContain('name');
    expect(WHAT_WE_STORE_MINIMAL.toLowerCase()).toContain('email');
    expect(WHAT_WE_STORE_MINIMAL.toLowerCase()).toContain('no phone');
    expect(WHAT_WE_STORE_MINIMAL.toLowerCase()).toContain('address');
  });

  it('signup and onboarding never collect a phone field', () => {
    const auth = read('src/components/AuthForm.tsx');
    const onboard = read('src/components/OnboardingWizard.tsx');
    expect(auth).not.toMatch(/type=["']tel["']/);
    expect(auth).not.toMatch(/id=["']phone["']/);
    expect(onboard).not.toMatch(/type=["']tel["']/);
    expect(onboard).not.toMatch(/id=["']phone["']/);
    expect(onboard).not.toMatch(/id=["']zip["']/);
    expect(onboard).not.toMatch(/street address/i);
  });
});

describe('catalog value ranking', () => {
  it('puts no-proof, higher payout, then sooner deadlines first when the flag is on', () => {
    const rows = [
      makeLawsuit({ proof: 'yes' }, { id: 'proof-yes', payout_max: 900, deadline: '2026-11-01' }),
      makeLawsuit({ proof: 'no' }, { id: 'no-proof-low', payout_max: 20, deadline: '2026-12-01' }),
      makeLawsuit({ proof: 'no' }, { id: 'no-proof-high', payout_max: 400, deadline: '2027-01-01' }),
      makeLawsuit({ proof: 'unknown' }, { id: 'unknown', payout_max: 5000, deadline: '2026-10-01' }),
    ];
    expect(sortCatalogValueFirst(rows).map((r) => r.id)).toEqual([
      'no-proof-high',
      'no-proof-low',
      'proof-yes',
      'unknown',
    ]);
  });

  it('does not change default catalog order while the flag is off', () => {
    const rows = [
      makeLawsuit({ proof: 'yes' }, { id: 'soon-proof', deadline: '2026-11-01', payout_max: 10 }),
      makeLawsuit({ proof: 'no' }, { id: 'later-free', deadline: '2026-12-01', payout_max: 999 }),
    ];
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['soon-proof', 'later-free']);
    vi.stubEnv('CATALOG_VALUE_RANK_ENABLED', '1');
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['later-free', 'soon-proof']);
  });

  it('does not invent a payout rank from empty catalog fields', () => {
    const rows = [
      makeLawsuit({ proof: 'no' }, { id: 'known', payout_max: 50, typical_payout: '$50' }),
      makeLawsuit({ proof: 'no' }, { id: 'blank', payout_max: null, payout_min: null, typical_payout: null }),
    ];
    expect(sortCatalogValueFirst(rows).map((r) => r.id)).toEqual(['known', 'blank']);
  });
});

describe('settlement facts hide unknowns', () => {
  it('still shows Not stated / Unknown when the trust-copy flag is off', () => {
    const facts = settlementAnswerFacts(
      makeLawsuit({}, { typical_payout: null, administrator: 'Acme Admin', eligibility: { proof: 'unknown' } }),
    );
    expect(facts.payout).toBe('Not stated');
    expect(facts.proof).toBe('Unknown');
    expect(facts.administrator).toBe('Acme Admin');
  });

  it('omits payout and proof when unknown and the flag is on', () => {
    vi.stubEnv('PANEL_TRUST_COPY_ENABLED', '1');
    const facts = settlementAnswerFacts(
      makeLawsuit({}, { typical_payout: null, administrator: 'Acme Admin', eligibility: { proof: 'unknown' } }),
    );
    expect(facts.payout).toBeNull();
    expect(facts.proof).toBeNull();
    expect(facts.administrator).toBe('Acme Admin');
    const html = renderToStaticMarkup(
      createElement(AnswerBlock, {
        facts,
        open: true,
        claimHref: '/claim/x',
        official: { href: 'https://admin.example/form', kind: 'official', label: 'Official site', host: 'admin.example' },
      }),
    );
    expect(html).not.toContain('Listed payout');
    expect(html).not.toContain('Proof needed');
    expect(html).toContain('Acme Admin');
    expect(html).toContain('Official claim site');
  });
});

describe('signed-out eligibility quiz from stored text', () => {
  it('builds prompts only from stored eligibility text, never a qualify verdict', () => {
    expect(eligibilityQuizPrompts(null)).toEqual([]);
    expect(eligibilityQuizPrompts('Open to eligible US residents.')).toEqual([]);
    const prompts = eligibilityQuizPrompts(
      'People who bought a Widget in California in 2023. You must have a purchase record.',
    );
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.join(' ')).toContain('Widget');
    const yes = eligibilityQuizResultCopy({ yes: 2, no: 0, total: 2 });
    const no = eligibilityQuizResultCopy({ yes: 0, no: 2, total: 2 });
    expect(yes.toLowerCase()).not.toContain('you qualify');
    expect(no.toLowerCase()).not.toContain('you qualify');
    expect(yes.toLowerCase()).toContain('official notice');
    expect(no.toLowerCase()).toContain('official notice');
  });
});

describe('quiz and signed-out official-form events', () => {
  it('reuses official_form_opened and adds quiz events without a qualify verdict', () => {
    expect(ANALYTICS_EVENTS.official_form_opened).toBe('official_form_opened');
    expect(ANALYTICS_EVENTS.eligibility_quiz_started).toBe('eligibility_quiz_started');
    expect(ANALYTICS_EVENTS.eligibility_quiz_completed).toBe('eligibility_quiz_completed');
    const link = read('src/components/settlement/OfficialFormLink.tsx');
    expect(link).toContain('ANALYTICS_EVENTS.official_form_opened');
    expect(link).toContain("intent: 'official_form'");
    expect(link).toContain('is_filing: false');
    const quiz = read('src/components/settlement/SettlementEligibilityQuiz.tsx');
    expect(quiz).toContain('eligibility_quiz_started');
    expect(quiz).toContain('eligibility_quiz_completed');
    expect(quiz.toLowerCase()).not.toContain('you qualify for this');
  });
});
