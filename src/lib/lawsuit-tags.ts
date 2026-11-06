import type { EligibilityCriteria, LawsuitTags, ScrapedLawsuit } from './types';

/**
 * Conservative structured tags for a lawsuit. Unknown fields stay null so the
 * matcher never invents a brand, employer, state, or class period.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR = /^(19|20)\d{2}$/;

/** Brands we only extract as a whole word from source text. */
const KNOWN_BRANDS: readonly string[] = [
  'toyota',
  'honda',
  'ford',
  'kia',
  'hyundai',
  'tesla',
  'chevrolet',
  'facebook',
  'instagram',
  'tiktok',
  'meta',
  'google',
  'apple',
  'amazon',
  'netflix',
  'walmart',
  'target',
  'equifax',
  't-mobile',
  'verizon',
  'at&t',
  'capital one',
  'wells fargo',
  'bank of america',
  'chase',
];

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function emptyTags(): LawsuitTags {
  return {
    brands: null,
    employers: null,
    states: null,
    class_period_start: null,
    class_period_end: null,
  };
}

function sourceText(item: {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  eligibility_text?: string | null;
  eligibility?: EligibilityCriteria | null;
}): string {
  return [
    item.title,
    item.summary,
    item.description,
    item.eligibility_text,
    item.eligibility?.notes,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
}

function titleCaseBrand(value: string): string {
  if (value === 'at&t') return 'AT&T';
  if (value === 't-mobile') return 'T-Mobile';
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function wordMatches(text: string, brand: string): boolean {
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(text);
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function extractBrands(text: string): string[] | null {
  if (!text.trim()) return null;
  const found = KNOWN_BRANDS.filter((brand) => wordMatches(text, brand)).map(titleCaseBrand);
  const unique = uniqueTrimmed(found);
  return unique.length > 0 ? unique : null;
}

function extractEmployers(text: string): string[] | null {
  if (!text.trim()) return null;
  const names: string[] = [];
  const patterns = [
    /\bemployees of ([A-Z][A-Za-z0-9&.' -]{1,60}?)(?:\s+(?:who|during|from|between|in)\b|[.,;]|$)/g,
    /\bwho worked (?:at|for) ([A-Z][A-Za-z0-9&.' -]{1,60}?)(?:\s+(?:who|during|from|between|in)\b|[.,;]|$)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = (match[1] ?? '').trim().replace(/\s+/g, ' ');
      if (name.length >= 2 && name.length <= 80) names.push(name);
    }
  }
  const unique = uniqueTrimmed(names);
  return unique.length > 0 ? unique : null;
}

function extractStates(eligibility?: EligibilityCriteria | null): string[] | null {
  const states = (eligibility?.states ?? [])
    .map((code) => code.trim().toUpperCase())
    .filter((code) => US_STATE_CODES.has(code));
  const unique = uniqueTrimmed(states);
  return unique.length > 0 ? unique : null;
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseNamedDate(value: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  return validIsoDate(`${m[3]}-${month}-${day}`);
}

function extractClassPeriod(
  eligibility?: EligibilityCriteria | null,
  text = '',
): { start: string | null; end: string | null } {
  const fromRange = {
    start: validIsoDate(eligibility?.dateRange?.from),
    end: validIsoDate(eligibility?.dateRange?.to),
  };
  if (fromRange.start || fromRange.end) return fromRange;

  const named = text.match(
    /\bbetween\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+and\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/i,
  );
  if (named) {
    const start = parseNamedDate(named[1]);
    const end = parseNamedDate(named[2]);
    if (start || end) return { start, end };
  }

  const iso = text.match(
    /\bclass period\b[^.]{0,80}?(\d{4}-\d{2}-\d{2})\s+(?:to|through|–|-)\s+(\d{4}-\d{2}-\d{2})/i,
  );
  if (iso) {
    const start = validIsoDate(iso[1]);
    const end = validIsoDate(iso[2]);
    if (start || end) return { start, end };
  }

  const years = text.match(/\bclass period\b[^.]{0,40}?\b((?:19|20)\d{2})\s*(?:to|through|–|-)\s*((?:19|20)\d{2})\b/i);
  if (years && YEAR.test(years[1]) && YEAR.test(years[2])) {
    return { start: `${years[1]}-01-01`, end: `${years[2]}-12-31` };
  }

  return { start: null, end: null };
}

/** Build conservative tags from a scraped record or an existing lawsuit. */
export function extractLawsuitTags(item: {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  eligibility_text?: string | null;
  eligibility?: EligibilityCriteria | null;
  category?: string | null;
}): LawsuitTags {
  const text = sourceText(item);
  const period = extractClassPeriod(item.eligibility, text);
  const brands = extractBrands(text);
  const employers =
    item.category === 'Employment' || /\b(employee|employer|worked (?:at|for)|hourly|wage)\b/i.test(text)
      ? extractEmployers(text)
      : null;

  return {
    brands,
    employers,
    states: extractStates(item.eligibility),
    class_period_start: period.start,
    class_period_end: period.end,
  };
}

export function tagsFromScraped(item: ScrapedLawsuit): LawsuitTags {
  return extractLawsuitTags(item);
}

export function normalizeLawsuitTags(value: unknown): LawsuitTags {
  const empty = emptyTags();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const raw = value as Record<string, unknown>;
  const list = (key: string): string[] | null => {
    const v = raw[key];
    if (!Array.isArray(v)) return null;
    const values = uniqueTrimmed(v.filter((item): item is string => typeof item === 'string'));
    return values.length > 0 ? values : null;
  };
  return {
    brands: list('brands'),
    employers: list('employers'),
    states: list('states'),
    class_period_start: validIsoDate(typeof raw.class_period_start === 'string' ? raw.class_period_start : null),
    class_period_end: validIsoDate(typeof raw.class_period_end === 'string' ? raw.class_period_end : null),
  };
}

export function lawsuitHasStructuredTags(tags: LawsuitTags | null | undefined): boolean {
  if (!tags) return false;
  return Boolean(
    (tags.brands && tags.brands.length > 0) ||
      (tags.employers && tags.employers.length > 0),
  );
}
