import { describe, expect, it } from 'vitest';
import {
  applyCloseBreaker,
  DEFAULT_MAX_CLOSE_SHARE,
  isLocked,
  maxCloseShareFromEnv,
  nextStatus,
  planIngest,
  type ExistingRow,
} from '@/lib/scraper/plan';
import {
  mapSettleSignalFeed,
  mapSettleSignalRecord,
  mapSettleSignalStatus,
  settleSignalExternalId,
} from '@/lib/scraper/sources/settlesignal';
import type { ScrapedLawsuit } from '@/lib/types';

const now = new Date('2026-10-16T08:00:00Z');
const SOURCE = '11111111-1111-4111-8111-111111111111';

function item(overrides: Partial<ScrapedLawsuit> = {}): ScrapedLawsuit {
  return {
    external_id: 'settlesignal:a',
    title: 'Acme Data Breach Settlement',
    summary: 'Acme Data Breach Settlement. Estimated payout: up to $100',
    description: 'Up to $100',
    category: 'Privacy',
    typical_payout: 'Up to $100',
    proof_required: false,
    deadline: '2026-12-01',
    eligibility: { proof: 'unknown' },
    eligibility_text: 'Open to eligible US residents.',
    source_url: 'https://settlesignal.com/settlements/acme/',
    claim_url: 'https://acmesettlement.com/claim',
    status: 'open',
    ...overrides,
  };
}

function row(overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id: 'row-a',
    slug: 'acme-data-breach-settlement',
    external_id: 'settlesignal:a',
    status: 'open',
    deadline: '2026-12-01',
    review_status: 'published',
    reviewed_at: null,
    title: 'Acme Data Breach Settlement',
    claim_url: 'https://acmesettlement.com/claim',
    ...overrides,
  };
}

const plan = (items: ScrapedLawsuit[], existing: ExistingRow[]) =>
  planIngest({ items, existing, sourceId: SOURCE, now });

describe('new records', () => {
  it('wait for review and never publish or invent amounts', () => {
    const p = plan([item()], []);
    expect(p.inserts).toHaveLength(1);
    expect(p.inserts[0]).toMatchObject({
      slug: 'acme-data-breach-settlement',
      review_status: 'pending_review',
      status: 'open',
      source_id: SOURCE,
      external_id: 'settlesignal:a',
      estimated_value_min: null,
      estimated_value_max: null,
      extraction_confidence: null,
    });
  });

  it('are added only when the source says they are open and the deadline has not passed', () => {
    expect(plan([item({ status: 'closed' })], []).inserts).toHaveLength(0);
    expect(plan([item({ status: 'unknown' })], []).inserts).toHaveLength(0);
    expect(plan([item({ deadline: '2026-10-01' })], []).inserts).toHaveLength(0);
    // Adapters that cannot tell a status still add records.
    expect(plan([item({ status: undefined })], []).inserts).toHaveLength(1);
    expect(plan([item({ status: 'closed' })], []).skipped).toBe(1);
  });

  it('never re-create a fictional settlement or a duplicate slug', () => {
    const fake = item({ external_id: 'x:1', title: 'Heartburn Medication Impurity Settlement' });
    expect(plan([fake], []).inserts).toHaveLength(0);
    const twins = [item({ external_id: 'x:1' }), item({ external_id: 'x:2' })];
    expect(plan(twins, []).inserts).toHaveLength(1);
  });
});

describe('published rows (locked)', () => {
  it('take a new deadline from the feed and nothing else', () => {
    const p = plan(
      [item({ deadline: '2026-12-15', title: 'Acme Settlement (amended)', claim_url: 'https://other.example.org/' })],
      [row()],
    );
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].patch).toEqual({ deadline: '2026-12-15' });
    expect(p.updates[0].deadlineChange).toEqual({ from: '2026-12-01', to: '2026-12-15' });
    expect(p.updates[0].closes).toBe(false);
    expect(p.flagged).toEqual([{ slug: 'acme-data-breach-settlement', fields: ['title', 'claim_url'] }]);
  });

  it('close when the feed says closed', () => {
    const p = plan([item({ status: 'closed' })], [row()]);
    expect(p.updates[0].patch).toEqual({ status: 'closed' });
    expect(p.updates[0].closes).toBe(true);
  });

  it('close when the new deadline has already passed', () => {
    const p = plan([item({ deadline: '2026-10-01' })], [row()]);
    expect(p.updates[0].closes).toBe(true);
  });

  it('reopen when the feed lists them as open again', () => {
    const p = plan([item({ status: 'open', deadline: '2026-12-31' })], [row({ status: 'closed' })]);
    expect(p.updates[0].patch).toEqual({ status: 'open', deadline: '2026-12-31' });
    expect(p.updates[0].reopens).toBe(true);
  });

  it('do not change when the feed status is unknown or the deadline is missing', () => {
    expect(plan([item({ status: 'unknown', deadline: null })], [row()]).updates).toHaveLength(0);
    expect(plan([item({ status: undefined })], [row()]).updates).toHaveLength(0);
  });

  it('ignore URL formatting differences', () => {
    const p = plan([item({ claim_url: 'https://acmesettlement.com/claim' })], [row({ claim_url: 'https://acmesettlement.com/claim ' })]);
    expect(p.flagged).toHaveLength(0);
  });

  it('never touch draft rows', () => {
    expect(nextStatus('draft', 'open')).toBeNull();
    expect(nextStatus('draft', 'closed')).toBeNull();
  });
});

describe('absence from the feed', () => {
  it('changes nothing', () => {
    const p = plan([item({ external_id: 'settlesignal:other', title: 'Other Settlement' })], [row()]);
    expect(p.updates).toHaveLength(0);
  });

  it('an empty feed changes nothing', () => {
    const p = plan([], [row(), row({ id: 'row-b', external_id: 'settlesignal:b', slug: 'b' })]);
    expect(p).toEqual({ inserts: [], updates: [], flagged: [], skipped: 0 });
  });
});

describe('rows nobody reviewed yet', () => {
  it('follow the feed but keep their slug and review state', () => {
    const p = plan(
      [item({ title: 'Acme Settlement v2', status: 'closed' })],
      [row({ review_status: 'pending_review', title: 'Acme' })],
    );
    const patch = p.updates[0].patch;
    expect(patch.title).toBe('Acme Settlement v2');
    expect(patch.status).toBe('closed');
    expect(patch).not.toHaveProperty('slug');
    expect(patch).not.toHaveProperty('review_status');
    expect(p.updates[0].closes).toBe(false); // it was never public
  });

  it('counts a reviewed or rejected row as locked', () => {
    expect(isLocked({ review_status: 'pending_review', reviewed_at: '2026-10-01T00:00:00Z' })).toBe(true);
    expect(isLocked({ review_status: 'rejected', reviewed_at: null })).toBe(true);
    expect(isLocked({ review_status: 'pending_review', reviewed_at: null })).toBe(false);
  });
});

describe('circuit breaker', () => {
  const rows = Array.from({ length: 100 }, (_, i) =>
    row({ id: `r${i}`, external_id: `settlesignal:${i}`, slug: `s-${i}` }),
  );
  const closing = (n: number) =>
    rows.map((r, i) => item({ external_id: r.external_id!, title: `S ${i}`, status: i < n ? 'closed' : 'open' }));

  it('lets a normal night through', () => {
    const p = plan(closing(20), rows);
    const { plan: applied, held } = applyCloseBreaker(p, { openCount: 100, maxShare: 0.2 });
    expect(held).toHaveLength(0);
    expect(applied.updates.filter((u) => u.closes)).toHaveLength(20);
  });

  it('holds every closure when a run would close too much, and keeps the rest', () => {
    const p = plan(closing(60), rows);
    p.updates.push({ ...p.updates[0], id: 'x', slug: 'x', closes: false, patch: { deadline: '2027-01-01' } });
    const { plan: applied, held, allowed } = applyCloseBreaker(p, { openCount: 100, maxShare: 0.2 });
    expect(allowed).toBe(20);
    expect(held).toHaveLength(60);
    expect(applied.updates.every((u) => !u.closes)).toBe(true);
    expect(applied.updates).toHaveLength(1);
  });

  it('always allows a few closures on a small catalog', () => {
    const p = plan(closing(5), rows.slice(0, 6));
    expect(applyCloseBreaker(p, { openCount: 6, maxShare: 0.2 }).held).toHaveLength(0);
  });

  it('reads INGEST_MAX_CLOSE_SHARE safely', () => {
    expect(maxCloseShareFromEnv(undefined)).toBe(DEFAULT_MAX_CLOSE_SHARE);
    expect(maxCloseShareFromEnv('')).toBe(DEFAULT_MAX_CLOSE_SHARE);
    expect(maxCloseShareFromEnv('1')).toBe(1);
    expect(maxCloseShareFromEnv('0.5')).toBe(0.5);
    expect(maxCloseShareFromEnv('2')).toBe(DEFAULT_MAX_CLOSE_SHARE);
    expect(maxCloseShareFromEnv('-1')).toBe(DEFAULT_MAX_CLOSE_SHARE);
    expect(maxCloseShareFromEnv('lots')).toBe(DEFAULT_MAX_CLOSE_SHARE);
  });
});

describe('SettleSignal mapping', () => {
  const record = {
    '@id': 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
    title: 'Amazon Return Policy Settlement',
    url: 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
    category: '',
    settlement_type: 'consumer_product_settlement',
    status: 'Open for claims',
    claim_deadline: '2026-12-01',
    proof_required: 'optional',
    applicable_states: [],
    official_claim_url: 'https://www.returnsettlement.com/submit-claim',
    official_settlement_url: 'https://www.returnsettlement.com/',
    estimated_payout: 'No fixed per-person amount is stated.',
    verification_status: 'official_source_found',
    accepted_official_evidence: true,
    last_verified: '2026-10-03',
  };

  it('maps every status the feed uses', () => {
    expect(mapSettleSignalStatus('Open for claims')).toBe('open');
    for (const s of ['Claim window closed', 'Closed', 'Paid', 'Payments started', 'Payment pending', 'Automatic payment']) {
      expect(mapSettleSignalStatus(s)).toBe('closed');
    }
    for (const s of ['Published record', 'Pending final approval', 'Something new', '', null]) {
      expect(mapSettleSignalStatus(s)).toBe('unknown');
    }
  });

  it('maps a record with the official claim form, the source page and the proof rule', () => {
    const mapped = mapSettleSignalRecord(record);
    expect(mapped).toMatchObject({
      external_id: settleSignalExternalId(record['@id']),
      title: 'Amazon Return Policy Settlement',
      claim_url: 'https://www.returnsettlement.com/submit-claim',
      source_url: 'https://settlesignal.com/settlements/amazon-return-policy-settlement/',
      deadline: '2026-12-01',
      status: 'open',
      proof_required: false,
      typical_payout: 'No fixed per-person amount is stated.',
    });
    expect(mapped?.eligibility?.proof).toBe('optional');
  });

  it('falls back to the official settlement site and drops non-web links', () => {
    expect(mapSettleSignalRecord({ ...record, official_claim_url: null })?.claim_url).toBe(
      'https://www.returnsettlement.com/',
    );
    expect(
      mapSettleSignalRecord({ ...record, official_claim_url: 'javascript:alert(1)', official_settlement_url: null })
        ?.claim_url,
    ).toBeUndefined();
  });

  it('keeps the external id format existing rows use', () => {
    expect(settleSignalExternalId(record['@id'])).toBe(
      `settlesignal:${record['@id'].replace(/[^a-zA-Z0-9-]/g, '-').slice(-80)}`,
    );
  });

  it('skips records without official evidence and malformed ones', () => {
    expect(mapSettleSignalRecord({ ...record, accepted_official_evidence: false })).toBeNull();
    expect(mapSettleSignalRecord({ ...record, title: '' })).toBeNull();
    expect(mapSettleSignalRecord({ title: 'x' })).toBeNull();
    expect(mapSettleSignalRecord(null)).toBeNull();
  });

  it('returns nothing for a reshaped feed', () => {
    expect(mapSettleSignalFeed({ data: [] })).toEqual([]);
    expect(mapSettleSignalFeed(null)).toEqual([]);
    expect(mapSettleSignalFeed({ settlements: [record, { nope: true }] })).toHaveLength(1);
  });
});
