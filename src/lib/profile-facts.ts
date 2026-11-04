import type { ProfileFact, ProfileFactType } from './types';

export const PROFILE_FACT_TYPES: readonly ProfileFactType[] = [
  'brand',
  'product',
  'account',
  'employer',
  'location',
  'purchase',
];

export const PROFILE_FACT_TYPE_SET: ReadonlySet<string> = new Set(PROFILE_FACT_TYPES);

export const PROFILE_FACT_LABELS: Record<ProfileFactType, string> = {
  brand: 'Brand',
  product: 'Product',
  account: 'Account or platform',
  employer: 'Employer',
  location: 'Location',
  purchase: 'Purchase',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ProfileFactInput = {
  type?: unknown;
  value?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  source?: unknown;
};

export type ParseFactsResult =
  | { ok: true; facts: ProfileFact[] }
  | { ok: false; error: string };

function cleanText(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

export function parseProfileFacts(input: unknown, opts: { source?: string; max?: number } = {}): ParseFactsResult {
  if (input == null) return { ok: true, facts: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'Profile facts must be a list.' };

  const max = opts.max ?? 40;
  if (input.length > max) return { ok: false, error: `You can save up to ${max} profile facts.` };

  const facts: ProfileFact[] = [];
  const seen = new Set<string>();

  for (const raw of input as ProfileFactInput[]) {
    if (!raw || typeof raw !== 'object') continue;
    const type = typeof raw.type === 'string' ? raw.type.trim() : '';
    if (!PROFILE_FACT_TYPE_SET.has(type)) {
      return { ok: false, error: 'Each fact needs a type: brand, product, account, employer, location, or purchase.' };
    }
    const value = cleanText(raw.value, 200);
    if (!value) continue;

    const start_date = cleanDate(raw.start_date);
    const end_date = cleanDate(raw.end_date);
    if (raw.start_date && !start_date) {
      return { ok: false, error: 'Use YYYY-MM-DD dates for profile facts.' };
    }
    if (raw.end_date && !end_date) {
      return { ok: false, error: 'Use YYYY-MM-DD dates for profile facts.' };
    }
    if (start_date && end_date && start_date > end_date) {
      return { ok: false, error: 'A fact’s end date can’t be before its start date.' };
    }

    const source = cleanText(raw.source, 80) ?? opts.source ?? 'user';
    const key = `${type}|${value.toLowerCase()}|${start_date ?? ''}|${end_date ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    facts.push({
      type: type as ProfileFactType,
      value,
      start_date,
      end_date,
      source,
    });
  }

  return { ok: true, facts };
}

export function factsFromRows(
  rows: Array<{
    type?: string | null;
    value?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    source?: string | null;
    id?: string;
    created_at?: string;
  }> | null | undefined,
): ProfileFact[] {
  if (!rows?.length) return [];
  const parsed = parseProfileFacts(rows);
  return parsed.ok ? parsed.facts : [];
}

/** Inclusive date-range overlap. A missing bound is treated as open. */
export function dateRangesOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined,
): boolean {
  const aS = aStart || '0000-01-01';
  const aE = aEnd || '9999-12-31';
  const bS = bStart || '0000-01-01';
  const bE = bEnd || '9999-12-31';
  return aS <= bE && bS <= aE;
}

export function factYearLabel(fact: Pick<ProfileFact, 'start_date' | 'end_date'>): string | null {
  const startYear = fact.start_date?.slice(0, 4);
  const endYear = fact.end_date?.slice(0, 4);
  if (startYear && endYear && startYear !== endYear) return `${startYear}–${endYear}`;
  return startYear ?? endYear ?? null;
}
