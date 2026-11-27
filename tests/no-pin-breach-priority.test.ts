import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDashboardMatches,
  buildDashboardMatchesFromStored,
  compareDashboardMatches,
  type DashboardMatch,
} from '@/components/claims/dashboard-model';
import { filterCatalog, sortNoPinBreachFirst } from '@/lib/catalog-page';
import { flags } from '@/lib/flags';
import { previewMatchesFor } from '@/lib/match-preview';
import type { Lawsuit, Match } from '@/lib/types';
import { makeLawsuit, makeProfile } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

const NOW = new Date('2026-11-26T12:00:00Z');
const isFictional = (slug: string) => slug.startsWith('fake-');

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

/**
 * NO_PIN_BREACH_PRIORITY_ENABLED. The signal is lawsuits.claim_action_type
 * ('desk_file' / 'online_form' are the positives, 'needs_notice_id' the
 * negative) plus the free-text category. The column is owner-filled after
 * migration 0051, so every assertion here also covers the undefined case.
 */

describe('NO_PIN_BREACH_PRIORITY_ENABLED flag', () => {
  it('is off by default and turns on only for exactly "1"', () => {
    expect(flags.noPinBreachPriority()).toBe(false);
    for (const value of ['', '0', 'true', 'yes', 'on', 'TRUE']) {
      vi.stubEnv('NO_PIN_BREACH_PRIORITY_ENABLED', value);
      expect(flags.noPinBreachPriority(), value).toBe(false);
    }
    vi.stubEnv('NO_PIN_BREACH_PRIORITY_ENABLED', '1');
    expect(flags.noPinBreachPriority()).toBe(true);
  });
});

describe('compareDashboardMatches', () => {
  const match = (overrides: Partial<DashboardMatch>): DashboardMatch => ({
    id: overrides.slug ?? 'x',
    slug: overrides.slug ?? 'x',
    title: 'A settlement',
    deadlineText: 'soon',
    reasons: [],
    strength: 'possible',
    label: 'Possible match',
    officialUrl: null,
    score: 0.5,
    payoutMin: null,
    payoutMax: null,
    ...overrides,
  });

  it('never lets an easy-to-file possible match jump above a strong match', () => {
    const easyPossible = match({
      slug: 'easy',
      strength: 'possible',
      score: 0.4,
      claimActionType: 'desk_file',
      category: 'Data Breach',
    });
    const hardStrong = match({
      slug: 'hard',
      strength: 'strong',
      score: 1,
      claimActionType: 'needs_notice_id',
      category: 'Employment',
    });
    const sorted = [easyPossible, hardStrong].sort((a, b) =>
      compareDashboardMatches(a, b, { noPinBreachFirst: true }),
    );
    expect(sorted.map((m) => m.slug)).toEqual(['hard', 'easy']);
  });

  it('puts a lower-scoring no-PIN breach row ahead inside one strength band', () => {
    const rows = [
      match({ slug: 'pin-high', score: 0.7, claimActionType: 'needs_notice_id', category: 'Data Breach' }),
      match({ slug: 'nopin-low', score: 0.45, claimActionType: 'desk_file', category: 'Data Breach' }),
      match({ slug: 'nopin-notbreach', score: 0.6, claimActionType: 'online_form', category: 'Employment' }),
    ];
    expect(
      [...rows].sort((a, b) => compareDashboardMatches(a, b, { noPinBreachFirst: true })).map((m) => m.slug),
    ).toEqual(['nopin-low', 'nopin-notbreach', 'pin-high']);
    // Off: score order, unchanged.
    expect([...rows].sort((a, b) => compareDashboardMatches(a, b)).map((m) => m.slug)).toEqual([
      'pin-high',
      'nopin-notbreach',
      'nopin-low',
    ]);
  });

  it('keeps rows whose claim_action_type is unknown in score order', () => {
    const rows = [
      match({ slug: 'b', score: 0.5, category: 'Data Breach' }),
      match({ slug: 'a', score: 0.9, category: 'Data Breach' }),
    ];
    expect(
      [...rows].sort((a, b) => compareDashboardMatches(a, b, { noPinBreachFirst: true })).map((m) => m.slug),
    ).toEqual(['a', 'b']);
  });
});

describe('both dashboard builders get the same boost', () => {
  const lawsuits = (): Lawsuit[] => [
    makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      {
        id: uuid(),
        slug: 'pin-breach',
        title: 'Retailer Settlement',
        category: 'Data Breach',
        deadline: '2026-12-20',
        claim_action_type: 'needs_notice_id',
      },
    ),
    makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      {
        id: uuid(),
        slug: 'nopin-breach',
        title: 'Clinic Settlement',
        category: 'Data Breach',
        deadline: '2026-12-10',
        claim_action_type: 'online_form',
      },
    ),
  ];

  it('live-computed matches put the no-PIN breach row first only when the option is on', () => {
    const profile = makeProfile({ state: 'CA', attributes: { had_data_breach: true } });
    const rows = lawsuits();
    expect(buildDashboardMatches(profile, rows, NOW, isFictional).map((m) => m.slug)).toEqual([
      'pin-breach',
      'nopin-breach',
    ]);
    expect(
      buildDashboardMatches(profile, rows, NOW, isFictional, { noPinBreachFirst: true }).map((m) => m.slug),
    ).toEqual(['nopin-breach', 'pin-breach']);
  });

  it('stored matches get the identical order, so MATCH_STORE_ENABLED cannot change it', () => {
    const rows = lawsuits().map(
      (lawsuit, i) =>
        ({
          id: `m${i}`,
          user_id: 'u',
          lawsuit_id: lawsuit.id,
          score: 1,
          reasons: ['Available in your state (CA)'],
          dismissed: false,
          created_at: '2020-01-01T00:00:00Z',
          lawsuit,
        }) as unknown as Match & { lawsuit?: Lawsuit | null },
    );
    expect(buildDashboardMatchesFromStored(rows, NOW, isFictional).map((m) => m.slug)).toEqual([
      'pin-breach',
      'nopin-breach',
    ]);
    expect(
      buildDashboardMatchesFromStored(rows, NOW, isFictional, { noPinBreachFirst: true }).map((m) => m.slug),
    ).toEqual(['nopin-breach', 'pin-breach']);
  });
});

describe('logged-out preview re-sorts before the 8-row cap', () => {
  const draft = { state: 'NY', attributes: { had_data_breach: true } };

  const row = (slug: string, claim_action_type: Lawsuit['claim_action_type'], category: string) =>
    makeLawsuit(
      { states: ['NY'], requires: ['had_data_breach'] },
      { id: slug, slug, title: `${slug} settlement`, category, deadline: '2099-01-01', claim_action_type },
    );

  it('pulls a no-PIN breach row inside the cap and pushes a notice-ID row out', () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => row(`pin-${i}`, 'needs_notice_id', 'Data Breach')),
      row('nopin', 'desk_file', 'Data Breach'),
    ];
    expect(previewMatchesFor(pool, draft, NOW).map((r) => r.slug)).not.toContain('nopin');
    const boosted = previewMatchesFor(pool, draft, NOW, { noPinBreachFirst: true });
    expect(boosted).toHaveLength(8);
    expect(boosted[0].slug).toBe('nopin');
  });

  it('leaves the slice untouched when the option is off', () => {
    const pool = [row('a', 'needs_notice_id', 'Data Breach'), row('b', 'desk_file', 'Data Breach')];
    expect(previewMatchesFor(pool, draft, NOW).map((r) => r.slug)).toEqual(['a', 'b']);
  });
});

describe('catalog ordering', () => {
  const row = (id: string, claim_action_type: Lawsuit['claim_action_type'], category: string, deadline: string) =>
    makeLawsuit({ proof: 'no' }, { id, title: `${id} settlement`, category, deadline, claim_action_type });

  it('puts no-PIN breach rows first, keeping the deadline order inside each group', () => {
    const rows = [
      row('pin-soon', 'needs_notice_id', 'Data Breach', '2026-11-01'),
      row('nopin-late', 'desk_file', 'Data Breach', '2027-01-01'),
      row('nopin-notbreach', 'online_form', 'Employment', '2026-12-01'),
      row('unknown', undefined, 'Data Breach', '2026-10-01'),
    ];
    expect(sortNoPinBreachFirst(rows).map((r) => r.id)).toEqual([
      'nopin-late',
      'nopin-notbreach',
      'unknown',
      'pin-soon',
    ]);
  });

  it('does not change the default catalog order while both ordering flags are off', () => {
    const rows = [
      row('pin-soon', 'needs_notice_id', 'Data Breach', '2026-11-01'),
      row('nopin-late', 'desk_file', 'Data Breach', '2027-01-01'),
    ];
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['pin-soon', 'nopin-late']);
    vi.stubEnv('NO_PIN_BREACH_PRIORITY_ENABLED', '1');
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['nopin-late', 'pin-soon']);
  });

  it('lets the no-PIN order win when CATALOG_VALUE_RANK_ENABLED is also on', () => {
    const rows = [
      row('pin-high-payout', 'needs_notice_id', 'Data Breach', '2027-01-01'),
      row('nopin-no-payout', 'desk_file', 'Data Breach', '2027-02-01'),
    ];
    rows[0].payout_max = 5000;
    vi.stubEnv('CATALOG_VALUE_RANK_ENABLED', '1');
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['pin-high-payout', 'nopin-no-payout']);
    vi.stubEnv('NO_PIN_BREACH_PRIORITY_ENABLED', '1');
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['nopin-no-payout', 'pin-high-payout']);
  });
});
