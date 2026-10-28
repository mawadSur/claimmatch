import type { Administrator, FilingMethod } from '@/lib/types';

export const KNOWN_ADMINISTRATORS: ReadonlyArray<{
  slug: string;
  name: string;
  filing_method: FilingMethod;
  homepage_url: string;
}> = [
  { slug: 'epiq', name: 'Epiq', filing_method: 'manual', homepage_url: 'https://www.epiqglobal.com' },
  { slug: 'kroll', name: 'Kroll', filing_method: 'manual', homepage_url: 'https://www.kroll.com' },
  { slug: 'jnd', name: 'JND Legal Administration', filing_method: 'manual', homepage_url: 'https://www.jndla.com' },
  { slug: 'angeion', name: 'Angeion Group', filing_method: 'manual', homepage_url: 'https://www.angeiongroup.com' },
  { slug: 'rust', name: 'Rust Consulting', filing_method: 'manual', homepage_url: 'https://www.rustconsulting.com' },
  { slug: 'rg2', name: 'RG/2 Claims Administration', filing_method: 'manual', homepage_url: 'https://www.rg2claims.com' },
];

const FILING_METHODS = new Set<FilingMethod>(['manual', 'browser', 'api']);

export function isFilingMethod(value: unknown): value is FilingMethod {
  return typeof value === 'string' && FILING_METHODS.has(value as FilingMethod);
}

export function guessAdministratorSlug(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const hit = KNOWN_ADMINISTRATORS.find(
    (a) => n === a.slug || n.includes(a.slug) || n.includes(a.name.toLowerCase().split(' ')[0]!),
  );
  return hit?.slug ?? null;
}

export function administratorBySlug(
  rows: Administrator[],
  slug: string,
): Administrator | null {
  return rows.find((r) => r.slug === slug) ?? null;
}
