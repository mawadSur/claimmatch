import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MATCH_PREVIEW_ATTRIBUTE_KEYS,
  MATCH_PREVIEW_QUESTIONS,
  mergePreviewIntoAnswers,
  parseMatchPreviewDraft,
  previewMatchesFor,
  previewMatchesForScope,
  previewProfileFromDraft,
  scopedPreviewQuestions,
} from '@/lib/match-preview';
import { RETIRED_QUESTION_KEYS } from '@/lib/eligibility';
import { makeLawsuit } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logged-out match preview', () => {
  it('asks state plus a handful of yes/no matcher keys and never health', () => {
    const keys = MATCH_PREVIEW_QUESTIONS.map((q) => q.key);
    expect(keys[0]).toBe('state');
    expect(keys.slice(1).sort()).toEqual([...MATCH_PREVIEW_ATTRIBUTE_KEYS].sort());
    expect(keys).toContain('had_data_breach');
    expect(keys).toContain('bought_consumer_goods');
    expect(keys.some((key) => RETIRED_QUESTION_KEYS.includes(key))).toBe(false);
    expect(keys).not.toContain('took_medication');
    expect(keys).not.toContain('vehicle_brands');
  });

  it('drops unknown keys and health answers from stored drafts', () => {
    const draft = parseMatchPreviewDraft({
      state: 'NY',
      attributes: {
        had_data_breach: true,
        took_medication: true,
        owns_vehicle: true,
        junk: 'nope',
      },
    });
    expect(draft).toEqual({
      state: 'NY',
      attributes: { had_data_breach: true },
    });
    expect(parseMatchPreviewDraft({ state: 'ZZ' })).toBeNull();
  });

  it('fills blank onboarding answers and leaves existing ones alone', () => {
    const merged = mergePreviewIntoAnswers(
      { used_banking: false },
      { state: 'CA', attributes: { used_banking: true, had_data_breach: true } },
    );
    expect(merged.used_banking).toBe(false);
    expect(merged.had_data_breach).toBe(true);
  });

  it('labels results Strong match or Possible match and never invents a payout', () => {
    const draft = {
      state: 'NY',
      attributes: { had_data_breach: true, bought_consumer_goods: false, used_banking: false, used_streaming: false },
    };
    const lawsuits = [
      makeLawsuit(
        { states: ['NY'], requires: ['had_data_breach'] },
        {
          id: 'strong-1',
          slug: 'breach-ny',
          title: 'NY breach settlement',
          typical_payout: '$40–$80',
          deadline: '2099-06-01',
        },
      ),
      makeLawsuit(
        { states: ['NY'] },
        {
          id: 'possible-1',
          slug: 'state-only',
          title: 'NY-only settlement',
          typical_payout: '  ',
          deadline: null,
        },
      ),
    ];
    const results = previewMatchesFor(lawsuits, draft);
    const strong = results.find((r) => r.slug === 'breach-ny');
    const possible = results.find((r) => r.slug === 'state-only');
    expect(strong?.strengthLabel).toBe('Strong match');
    expect(possible?.strengthLabel).toBe('Possible match');
    expect(strong?.typical_payout).toBe('$40–$80');
    expect(possible?.typical_payout).toBeNull();
    expect(JSON.stringify(results)).not.toMatch(/you qualify|eligib|% match/i);
    expect(previewProfileFromDraft(draft).attributes.took_medication).toBeUndefined();
  });

  it('scopes results and questions to one settlement’s catalog fields', () => {
    const draft = {
      state: 'NY',
      attributes: { had_data_breach: true, bought_consumer_goods: false, used_banking: false, used_streaming: false },
    };
    const lawsuits = [
      makeLawsuit({ states: ['NY'], requires: ['had_data_breach'] }, { id: 'a', slug: 'breach-ny', typical_payout: '$40' }),
      makeLawsuit({ states: ['NY'] }, { id: 'b', slug: 'state-only', typical_payout: '$10' }),
    ];
    const scoped = previewMatchesForScope(lawsuits, draft, 'breach-ny');
    expect(scoped.map((r) => r.slug)).toEqual(['breach-ny']);
    expect(scopedPreviewQuestions({ states: ['NY'], requires: ['had_data_breach'] }).map((q) => q.key)).toEqual([
      'state',
      'had_data_breach',
    ]);
  });
});

describe('match preview surfaces stay off until the flag is 1', () => {
  it('404s the API when the flag is off', async () => {
    const { POST } = await import('@/app/api/match-preview/route');
    const res = await POST(
      new Request('http://claimmatch.test/api/match-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'NY', attributes: { had_data_breach: true } }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('gates the public preview page and entries on the flag', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const read = (rel: string) =>
      readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
    expect(read('src/app/preview/page.tsx')).toContain('flags.matchPreview()');
    expect(read('src/app/preview/page.tsx')).toContain('flags.settlementPageCta()');
    expect(read('src/app/preview/page.tsx')).toContain('notFound()');
    expect(read('src/app/page.tsx')).toContain('flags.matchPreview()');
    expect(read('src/app/lawsuits/page.tsx')).toContain('flags.matchPreview()');
    expect(read('src/app/api/match-preview/route.ts')).toContain('flags.matchPreview()');
    expect(read('src/app/api/match-preview/route.ts')).toContain('flags.settlementPageCta()');
  });

  it('allows a settlement-scoped preview API call when only the page CTA flag is on', async () => {
    vi.resetModules();
    vi.stubEnv('SETTLEMENT_PAGE_CTA_ENABLED', '1');
    const { POST } = await import('@/app/api/match-preview/route');
    const res = await POST(
      new Request('http://claimmatch.test/api/match-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'NY',
          attributes: { had_data_breach: true },
          settlement: 'breach-ny',
        }),
      }),
    );
    // Catalog is empty in this unit test; the route must not 404.
    expect(res.status).not.toBe(404);
  });
});
