import { describe, expect, it } from 'vitest';
import {
  CATALOG_LIST_REVALIDATE_SECONDS,
  SETTLEMENT_PAGE_REVALIDATE_SECONDS,
  revalidateCatalogPaths,
} from '@/lib/catalog-cache';

describe('catalog cache', () => {
  it('keeps settlement pages on a 5-minute window and lists on 15', () => {
    expect(SETTLEMENT_PAGE_REVALIDATE_SECONDS).toBe(300);
    expect(CATALOG_LIST_REVALIDATE_SECONDS).toBe(900);
  });

  it('busts home, list, and the named settlement when a slug is given', () => {
    expect(revalidateCatalogPaths('bank-of-america-unused-vacation-class-action-settlement')).toEqual([
      '/',
      '/lawsuits',
      '/sitemap.xml',
      '/lawsuits/bank-of-america-unused-vacation-class-action-settlement',
      '/claim/bank-of-america-unused-vacation-class-action-settlement',
    ]);
  });

  it('busts hub pages when no slug is given', () => {
    const paths = revalidateCatalogPaths();
    expect(paths).toContain('/');
    expect(paths).toContain('/lawsuits');
    expect(paths).toContain('/settlements/closing-soon');
  });
});
