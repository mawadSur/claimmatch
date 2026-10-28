import { describe, expect, it } from 'vitest';
import {
  categoriesOf,
  cleanSearchTerm,
  displaySummary,
  filterOpenForClaims,
  isOpenForClaims,
  isPublicLawsuit,
  isSettleSignalRecord,
  officialLinkFor,
  searchCatalog,
  settleSignalPageFor,
} from '@/lib/lawsuits';
import {
  daysLeftToFile,
  daysUntil,
  deadlineCutoff,
  deadlineUrgencyLabel,
  formatDeadline,
  isDeadlinePassed,
  todayInLatestUSZone,
} from '@/lib/utils';
import type { Lawsuit } from '@/lib/types';

const at = (iso: string) => new Date(iso);

function lawsuit(overrides: Partial<Lawsuit> = {}): Lawsuit {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'amazon-return-policy-settlement',
    title: 'Amazon Return Policy Settlement',
    summary: 'Amazon Return Policy Settlement. Estimated payout: varies',
    description: null,
    category: 'Consumer Products',
    status: 'open',
    typical_payout: 'Varies',
    payout_min: null,
    payout_max: null,
    proof_required: false,
    deadline: '2026-12-01',
    eligibility: {},
    eligibility_text: null,
    source_id: null,
    source_url: 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
    claim_url: 'https://www.returnsettlement.com/submit-claim',
    external_id: 'settlesignal:amazon',
    hero_image_url: null,
    is_featured: false,
    review_status: 'published',
    extraction_confidence: null,
    administrator: null,
    raw_source_text: null,
    estimated_value_min: null,
    estimated_value_max: null,
    reviewed_by: null,
    reviewed_at: null,
    last_seen_at: null,
    missed_feed_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('deadline cutoff (through that date in America/New_York)', () => {
  it('ends a date-only deadline at midnight Eastern the next day', () => {
    // 2026-10-15 is EDT (UTC-4): midnight Oct 16 ET is 04:00 UTC.
    expect(deadlineCutoff('2026-10-15')?.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('keeps 2026-10-15 open at 2026-10-16T03:59Z and closes it at 04:00Z', () => {
    expect(isDeadlinePassed('2026-10-15', at('2026-10-16T03:59:59.999Z'))).toBe(false);
    expect(isDeadlinePassed('2026-10-15', at('2026-10-16T04:00:00Z'))).toBe(true);
  });

  it('is not fooled by midnight UTC on the deadline day', () => {
    // 00:00 UTC is 8 pm Eastern on the 15th: still the deadline day in New York.
    expect(isDeadlinePassed('2026-10-15', at('2026-10-16T00:00:00Z'))).toBe(false);
  });

  it('treats a missing or unreadable deadline as not passed', () => {
    for (const value of [null, undefined, '', 'Varies', '2026-02-30']) {
      expect(isDeadlinePassed(value, at('2030-01-01T00:00:00Z'))).toBe(false);
      expect(deadlineCutoff(value)).toBeNull();
    }
  });

  it('uses only the calendar date of a timestamp', () => {
    expect(deadlineCutoff('2026-10-15T00:00:00.000Z')?.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('agrees with the database form: deadline >= today in America/New_York', () => {
    const deadlines = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-12-31', '2027-01-01'];
    const start = Date.parse('2026-10-14T00:00:00Z');
    for (let t = start; t < start + 4 * 86_400_000; t += 37 * 60_000) {
      const now = new Date(t);
      const today = todayInLatestUSZone(now);
      for (const d of deadlines) {
        expect(d >= today).toBe(!isDeadlinePassed(d, now));
      }
    }
  });

  it('gives today in America/New_York', () => {
    expect(todayInLatestUSZone(at('2026-10-16T03:00:00Z'))).toBe('2026-10-15');
    expect(todayInLatestUSZone(at('2026-10-16T04:00:00Z'))).toBe('2026-10-16');
  });
});

describe('days left and urgency labels', () => {
  it('never overstates the time left', () => {
    // 03:00 UTC on the 16th is still the 15th in New York: last day, not "closed".
    expect(daysLeftToFile('2026-10-15', at('2026-10-16T03:00:00Z'))).toBe(0);
    expect(deadlineUrgencyLabel('2026-10-15', at('2026-10-16T03:00:00Z'))).toBe('Last day to file');
    expect(daysLeftToFile('2026-10-17', at('2026-10-16T03:00:00Z'))).toBe(2);
    expect(deadlineUrgencyLabel('2026-10-17', at('2026-10-16T03:00:00Z'))).toBe('2 days left');
    expect(deadlineUrgencyLabel('2026-10-26', at('2026-10-16T03:00:00Z'))).toBe('11 days left');
  });

  it('has no label after the deadline, far from it, or without one', () => {
    expect(daysLeftToFile('2026-10-15', at('2026-10-16T04:00:00Z'))).toBeNull();
    expect(deadlineUrgencyLabel('2026-10-15', at('2026-10-16T04:00:00Z'))).toBeNull();
    expect(deadlineUrgencyLabel('2027-06-01', at('2026-10-16T05:00:00Z'))).toBeNull();
    expect(deadlineUrgencyLabel(null)).toBeNull();
  });

  it('keeps the existing helpers working', () => {
    expect(daysUntil('2026-10-20', at('2026-10-16T12:00:00Z'))).toBe(4);
    expect(daysUntil(null)).toBeNull();
    expect(formatDeadline('2026-10-15')).toBe('Oct 15, 2026');
    expect(formatDeadline(null)).toBe('Varies');
  });
});

describe('isOpenForClaims', () => {
  const now = at('2026-10-16T08:00:00Z');

  it('accepts a published, real, open settlement before its deadline', () => {
    expect(isOpenForClaims(lawsuit(), now)).toBe(true);
    expect(isOpenForClaims(lawsuit({ status: 'closing_soon' }), now)).toBe(true);
  });

  it('treats no deadline as open unless the status says otherwise', () => {
    expect(isOpenForClaims(lawsuit({ deadline: null }), now)).toBe(true);
    expect(isOpenForClaims(lawsuit({ deadline: null, status: 'closed' }), now)).toBe(false);
  });

  it('honours the Eastern cutoff on the deadline day', () => {
    const l = lawsuit({ deadline: '2026-10-15' });
    expect(isOpenForClaims(l, at('2026-10-16T03:00:00Z'))).toBe(true);
    expect(isOpenForClaims(l, at('2026-10-16T04:00:00Z'))).toBe(false);
  });

  it('rejects closed and draft rows', () => {
    expect(isOpenForClaims(lawsuit({ status: 'closed' }), now)).toBe(false);
    expect(isOpenForClaims(lawsuit({ status: 'draft' }), now)).toBe(false);
  });

  it('rejects rows that are not published', () => {
    for (const review_status of ['pending_review', 'rejected', 'draft'] as const) {
      expect(isOpenForClaims(lawsuit({ review_status }), now)).toBe(false);
    }
  });

  it('rejects fictional settlements even when published and open', () => {
    const fake = lawsuit({ slug: 'heartburn-medication-impurity-settlement', deadline: '2027-01-13' });
    expect(isOpenForClaims(fake, now)).toBe(false);
    expect(isPublicLawsuit(fake)).toBe(false);
  });

  it('rejects any status it does not know', () => {
    expect(isOpenForClaims(lawsuit({ status: 'withdrawn' as Lawsuit['status'] }), now)).toBe(false);
  });

  it('filters lists in order', () => {
    const rows = [
      lawsuit({ slug: 'a' }),
      lawsuit({ slug: 'b', status: 'closed' }),
      lawsuit({ slug: 'c', deadline: '2026-10-01' }),
      lawsuit({ slug: 'robocall-tcpa-settlement' }),
      lawsuit({ slug: 'd', deadline: null }),
    ];
    expect(filterOpenForClaims(rows, now).map((r) => r.slug)).toEqual(['a', 'd']);
  });
});

describe('official links', () => {
  it('uses the claim URL as the official site', () => {
    expect(officialLinkFor(lawsuit())).toEqual({
      href: 'https://www.returnsettlement.com/submit-claim',
      kind: 'official',
      label: 'Official site',
      host: 'returnsettlement.com',
    });
  });

  it('labels a SettleSignal page as a source, never the official site', () => {
    const noClaim = officialLinkFor(lawsuit({ claim_url: null }));
    expect(noClaim).toMatchObject({ kind: 'source', label: 'SettleSignal listing', host: 'settlesignal.com' });

    const claimOnSettleSignal = officialLinkFor(
      lawsuit({ claim_url: 'https://settlesignal.com/settlements/x/', source_url: null }),
    );
    expect(claimOnSettleSignal).toMatchObject({ kind: 'source', label: 'SettleSignal listing' });
  });

  it('labels another source page honestly', () => {
    expect(
      officialLinkFor(lawsuit({ claim_url: null, source_url: 'https://news.example.org/story' })),
    ).toMatchObject({ kind: 'source', label: 'Source page', host: 'news.example.org' });
  });

  it('drops unsafe and placeholder links', () => {
    expect(officialLinkFor(lawsuit({ claim_url: 'javascript:alert(1)', source_url: null }))).toBeNull();
    expect(officialLinkFor(lawsuit({ claim_url: 'https://example.com/claim', source_url: null }))).toBeNull();
    expect(officialLinkFor(lawsuit({ claim_url: null, source_url: null }))).toBeNull();
  });

  it('knows which records came from SettleSignal', () => {
    expect(isSettleSignalRecord(lawsuit())).toBe(true);
    expect(isSettleSignalRecord(lawsuit({ external_id: null }))).toBe(true);
    expect(isSettleSignalRecord(lawsuit({ external_id: null, source_url: null }))).toBe(false);
    expect(
      isSettleSignalRecord(lawsuit({ external_id: 'other:1', source_url: 'https://www.court.gov/notice' })),
    ).toBe(false);
    expect(settleSignalPageFor(lawsuit({ source_url: 'https://www.court.gov/notice' }))).toBeNull();
  });
});

describe('displaySummary', () => {
  it('hides a summary that only repeats the title and payout', () => {
    expect(
      displaySummary({ title: 'A Settlement', summary: 'A Settlement. Estimated payout: Up to $50', typical_payout: 'Up to $50' }),
    ).toBeNull();
    expect(displaySummary({ title: 'A Settlement', summary: 'A Settlement', typical_payout: null })).toBeNull();
    expect(displaySummary({ title: 'A Settlement', summary: '  ', typical_payout: null })).toBeNull();
    expect(
      displaySummary({ title: 'A Settlement', summary: 'People who bought X between 2019 and 2022.', typical_payout: 'Varies' }),
    ).toBe('People who bought X between 2019 and 2022.');
  });
});

describe('catalog search', () => {
  const rows = [
    lawsuit({ slug: 'a', title: 'Overdraft Fee Settlement', summary: 'Bank fees', category: 'Financial & Banking' }),
    lawsuit({ slug: 'b', title: 'Data Breach Settlement', summary: 'Exposed records', category: 'Privacy' }),
    lawsuit({ slug: 'c', title: 'Car Defect Settlement', summary: null, category: 'Auto & Vehicles' }),
  ];

  it('matches every word in the title or summary, ignoring case', () => {
    expect(searchCatalog(rows, { q: 'bank FEES' }).map((r) => r.slug)).toEqual(['a']);
    expect(searchCatalog(rows, { q: 'settlement' })).toHaveLength(3);
    expect(searchCatalog(rows, { q: 'nothing here' })).toHaveLength(0);
  });

  it('filters by category', () => {
    expect(searchCatalog(rows, { category: 'Privacy' }).map((r) => r.slug)).toEqual(['b']);
    expect(searchCatalog(rows, { category: 'Privacy', q: 'car' })).toHaveLength(0);
  });

  it('cleans search terms and lists categories', () => {
    expect(cleanSearchTerm('  data   breach ')).toBe('data breach');
    expect(cleanSearchTerm('   ')).toBeUndefined();
    expect(cleanSearchTerm('x'.repeat(500))).toHaveLength(100);
    expect(categoriesOf(rows)).toEqual(['Auto & Vehicles', 'Financial & Banking', 'Privacy']);
  });
});
