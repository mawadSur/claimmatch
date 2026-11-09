import { describe, expect, it, vi } from 'vitest';
import { runHeldClosureSiteChecks } from '@/lib/held-closure-site-checks';
import {
  classifyHeldSiteBody,
  classifyHeldSiteHttp,
  groupHeldClosureSuggestions,
  needsHeldSiteCheck,
  partitionHeldPastDeadline,
  suggestHeldClosureDecision,
} from '@/lib/held-closure-triage';
import type { PlannedUpdate } from '@/lib/scraper/plan';
import { getSettlementGuide } from '@/lib/settlement-guides';

describe('suggestHeldClosureDecision', () => {
  const now = new Date('2026-11-05T12:00:00-05:00');

  it('marks a passed deadline as safe to close', () => {
    const result = suggestHeldClosureDecision({ deadline: '2026-11-04' }, now);
    expect(result.suggestion).toBe('safe_to_close');
    expect(result.evidence.join(' ')).toMatch(/2026-11-04/);
  });

  it('marks a 404 or closed official site as likely close', () => {
    expect(
      suggestHeldClosureDecision(
        { deadline: '2027-01-01', site: { http_status: 404, signal: 'gone' } },
        now,
      ).suggestion,
    ).toBe('likely_close');
    expect(
      suggestHeldClosureDecision(
        { deadline: '2027-01-01', site: { http_status: 200, signal: 'claims_closed' } },
        now,
      ).suggestion,
    ).toBe('likely_close');
  });

  it('marks a future deadline or still-open site as likely keep', () => {
    expect(suggestHeldClosureDecision({ deadline: '2027-01-01' }, now).suggestion).toBe(
      'likely_keep',
    );
    expect(
      suggestHeldClosureDecision(
        { deadline: null, site: { http_status: 200, signal: 'still_open' } },
        now,
      ).suggestion,
    ).toBe('likely_keep');
  });

  it('is unknown without a deadline or site check', () => {
    expect(suggestHeldClosureDecision({ deadline: null }, now).suggestion).toBe('unknown');
  });
});

describe('official-site body classification', () => {
  it('detects closed and open copy without storing the body', () => {
    expect(classifyHeldSiteBody('This settlement is closed. Thank you.')).toBe('claims_closed');
    expect(classifyHeldSiteBody('File a claim using the form below.')).toBe('still_open');
    expect(classifyHeldSiteBody('Welcome to the administrator site.')).toBeNull();
    expect(classifyHeldSiteHttp(404)).toBe('gone');
    expect(classifyHeldSiteHttp(410)).toBe('gone');
    expect(classifyHeldSiteHttp(200)).toBeNull();
  });
});

describe('held auto-close partition', () => {
  it('only auto-closes rows whose stored deadline is already past', () => {
    const held = [
      { id: 'past', slug: 'past', patch: {}, changes: [], closes: true },
      { id: 'future', slug: 'future', patch: {}, changes: [], closes: true },
      { id: 'none', slug: 'none', patch: {}, changes: [], closes: true },
    ] as unknown as PlannedUpdate[];
    const extras = new Map([
      ['past', { deadline: '2026-11-01' }],
      ['future', { deadline: '2027-03-01' }],
      ['none', { deadline: null }],
    ]);
    const { autoClose, remainHeld } = partitionHeldPastDeadline(
      held,
      extras,
      new Date('2026-11-05T12:00:00-05:00'),
    );
    expect(autoClose.map((r) => r.slug)).toEqual(['past']);
    expect(remainHeld.map((r) => r.slug)).toEqual(['future', 'none']);
  });

  it('reads a guided settlement’s official deadline, not the stored feed one', () => {
    const slug = 'kroger-prescription-drug-prices-class-action-settlement';
    const official = getSettlementGuide(slug)?.deadline;
    expect(official).toBe('2026-12-21');
    const held = [
      { id: 'early', slug, patch: {}, changes: [], closes: true },
      { id: 'late', slug, patch: {}, changes: [], closes: true },
    ] as unknown as PlannedUpdate[];
    const extras = new Map([
      ['early', { deadline: '2026-11-01' }], // the feed's passed first: stays held for a person
      ['late', { deadline: '2027-03-01' }], // the feed's is still ahead: closes once the official one passes
    ]);
    const before = partitionHeldPastDeadline(held, extras, new Date('2026-12-21T17:00:00Z'));
    expect(before.autoClose).toEqual([]);
    expect(before.remainHeld.map((r) => r.id)).toEqual(['early', 'late']);
    const after = partitionHeldPastDeadline(held, extras, new Date('2026-12-22T17:00:00Z'));
    expect(after.autoClose.map((r) => r.id)).toEqual(['early', 'late']);
  });
});

describe('held site-check scheduling', () => {
  it('rechecks missing or stale results only', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    expect(needsHeldSiteCheck({ officialHref: 'https://example.com', checked_at: null }, now)).toBe(
      true,
    );
    expect(
      needsHeldSiteCheck({ officialHref: 'https://example.com', checked_at: '2026-11-05T10:00:00Z' }, now),
    ).toBe(false);
    expect(
      needsHeldSiteCheck({ officialHref: 'https://example.com', checked_at: '2026-10-20T10:00:00Z' }, now),
    ).toBe(true);
  });

  it('does not probe URLs when the triage flag is off', async () => {
    const fetchFn = vi.fn();
    const result = await runHeldClosureSiteChecks({ fetchFn, targets: [] });
    expect(result).toEqual({ checked: 0, skipped: 'HELD_CLOSURE_TRIAGE_ENABLED is off' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('groupHeldClosureSuggestions', () => {
  it('counts each suggestion group', () => {
    const groups = groupHeldClosureSuggestions([
      { suggestion: 'safe_to_close' as const, slug: 'a' },
      { suggestion: 'safe_to_close' as const, slug: 'b' },
      { suggestion: 'likely_keep' as const, slug: 'c' },
    ]);
    expect(groups.safe_to_close).toHaveLength(2);
    expect(groups.likely_keep).toHaveLength(1);
    expect(groups.likely_close).toHaveLength(0);
  });
});
