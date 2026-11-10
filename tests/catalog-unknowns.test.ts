import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LawsuitCard } from '@/components/LawsuitCard';
import {
  catalogCardDeadlineLabel,
  catalogCardMissing,
  catalogCardPayout,
  catalogCardProof,
} from '@/lib/catalog-unknowns';
import { settlementAnswerFacts } from '@/lib/settlement-seo';
import { catalogLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const unknown = catalogLawsuit({
  eligibility: {},
  proof_required: false,
  typical_payout: null,
  deadline: null,
});

describe('catalog unknown leftovers', () => {
  it('still prints Unknown / Not stated / No deadline listed when the flag is off', () => {
    expect(catalogCardProof(unknown)).toBe('Unknown');
    expect(catalogCardPayout(null)).toBe('Not stated');
    expect(catalogCardDeadlineLabel(null, null)).toBe('No deadline listed');
    expect(catalogCardMissing(unknown)).toEqual([]);
    const html = renderToStaticMarkup(createElement(LawsuitCard, { lawsuit: unknown }));
    expect(html).toContain('Unknown');
    expect(html).toContain('Not stated');
    expect(html).toContain('No deadline listed');
    expect(html).not.toContain('have these details yet');
  });

  it('omits unknown rows and uses the honest missing line when the flag is on', () => {
    vi.stubEnv('CATALOG_HIDE_UNKNOWNS_ENABLED', '1');
    expect(catalogCardProof(unknown)).toBeNull();
    expect(catalogCardPayout(null)).toBeNull();
    expect(catalogCardDeadlineLabel(null, null)).toBeNull();
    expect(catalogCardMissing(unknown)).toEqual(['deadline', 'proof', 'listed payout']);
    const html = renderToStaticMarkup(createElement(LawsuitCard, { lawsuit: unknown }));
    expect(html).not.toContain('Unknown');
    expect(html).not.toContain('Not stated');
    expect(html).not.toContain('No deadline listed');
    expect(html).toContain('have these details yet');
    expect(html).toContain('deadline, proof, listed payout');
  });

  it('also hides unknown settlement facts when only the leftover flag is on', () => {
    vi.stubEnv('CATALOG_HIDE_UNKNOWNS_ENABLED', '1');
    const facts = settlementAnswerFacts(unknown);
    expect(facts.payout).toBeNull();
    expect(facts.proof).toBeNull();
    expect(facts.missing).toEqual(expect.arrayContaining(['proof', 'listed payout', 'deadline']));
  });

  it('Settings stops collecting phone only behind the leftover flag', () => {
    const settings = readFileSync('src/app/settings/page.tsx', 'utf8');
    expect(settings).toContain('collectPhone={!flags.catalogHideUnknowns()}');
    const prefs = readFileSync('src/components/NotificationPrefs.tsx', 'utf8');
    expect(prefs).toContain('...(collectPhone ? { phone } : {})');
    expect(prefs).toContain('{collectPhone ? (');
  });
});
