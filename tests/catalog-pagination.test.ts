import { describe, expect, it } from 'vitest';
import {
  catalogPath,
  catalogQueryString,
  filterCatalog,
  isThinSettlement,
  LAWSUITS_PAGE_SIZE,
  paginate,
  paginateCatalog,
  parseHasDeadline,
  parsePage,
  parseProofFilter,
  sortKnownDeadlineFirst,
} from '@/lib/catalog-page';
import { makeLawsuit } from './helpers';

describe('catalog pagination helpers', () => {
  it('parses page numbers and the deadline filter', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
    expect(parsePage('3')).toBe(3);
    expect(parseHasDeadline('1')).toBe(true);
    expect(parseHasDeadline('true')).toBe(true);
    expect(parseHasDeadline('0')).toBe(false);
  });

  it('pages 24 at a time and clamps past the end', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const first = paginate(items, 1);
    expect(first.pageSize).toBe(LAWSUITS_PAGE_SIZE);
    expect(first.items).toHaveLength(24);
    expect(first.totalPages).toBe(3);
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate([], 1).totalPages).toBe(1);
  });

  it('sorts known deadlines first, soonest first', () => {
    const rows = [
      makeLawsuit({}, { id: 'none', deadline: null }),
      makeLawsuit({}, { id: 'late', deadline: '2027-01-01' }),
      makeLawsuit({}, { id: 'soon', deadline: '2026-11-01' }),
    ];
    expect(sortKnownDeadlineFirst(rows).map((r) => r.id)).toEqual(['soon', 'late', 'none']);
  });

  it('filters "Has a deadline" without hiding the rest by default', () => {
    const rows = [
      makeLawsuit({}, { id: 'a', title: 'Alpha', deadline: '2026-11-01', category: 'Privacy' }),
      makeLawsuit({}, { id: 'b', title: 'Beta', deadline: null, category: 'Privacy' }),
    ];
    expect(filterCatalog(rows, {}).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterCatalog(rows, { hasDeadline: true }).map((r) => r.id)).toEqual(['a']);
  });

  it('filters listings whose source says proof is not required', () => {
    expect(parseProofFilter('no')).toBe('no');
    expect(parseProofFilter('yes')).toBeUndefined();
    const rows = [
      makeLawsuit({ proof: 'no' }, { id: 'none', title: 'None', deadline: '2026-11-01' }),
      makeLawsuit({ proof: 'yes' }, { id: 'need', title: 'Need', deadline: '2026-11-02' }),
    ];
    expect(filterCatalog(rows, { proof: 'no' }).map((r) => r.id)).toEqual(['none']);
    expect(catalogQueryString({ proof: 'no' })).toBe('proof=no');
  });

  it('builds query strings that drop page 1', () => {
    expect(catalogQueryString({ page: 1 })).toBe('');
    expect(catalogQueryString({ q: 'fee', hasDeadline: true, page: 2 })).toBe(
      'q=fee&hasDeadline=1&page=2',
    );
    expect(catalogPath({ page: 1 })).toBe('/lawsuits');
    expect(catalogPath({ q: 'fee', page: 2 })).toBe('/lawsuits?q=fee&page=2');
    expect(catalogPath({ q: 'fee', page: 1 })).toBe('/lawsuits?q=fee');
  });

  it('paginateCatalog is a no-op when pagination is off', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const all = paginateCatalog(items, 2, false);
    expect(all.items).toHaveLength(50);
    expect(all.totalPages).toBe(1);
    expect(all.page).toBe(1);
    const paged = paginateCatalog(items, 2, true);
    expect(paged.items).toHaveLength(24);
    expect(paged.page).toBe(2);
  });
});

describe('thin settlement rule', () => {
  it('is thin only when deadline, eligibility, administrator and payout are all empty', () => {
    expect(
      isThinSettlement(
        makeLawsuit({}, { deadline: null, eligibility_text: null, administrator: null, typical_payout: null }),
      ),
    ).toBe(true);
    expect(
      isThinSettlement(
        makeLawsuit({}, { deadline: null, eligibility_text: 'Open to eligible US residents.', administrator: null, typical_payout: null }),
      ),
    ).toBe(true);
    expect(
      isThinSettlement(makeLawsuit({}, { deadline: '2026-12-01', eligibility_text: null, administrator: null, typical_payout: null })),
    ).toBe(false);
    expect(
      isThinSettlement(
        makeLawsuit({}, { deadline: null, eligibility_text: 'Bought a Widget in 2023.', administrator: null, typical_payout: null }),
      ),
    ).toBe(false);
  });
});
