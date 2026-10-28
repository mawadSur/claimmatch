import type { EligibilityCriteria, Lawsuit } from '@/lib/types';
import { HEALTH_FEATURE_KEYS } from '@/lib/match-features';

/**
 * Draft structured eligibility rules from listing text. Never writes
 * lawsuits.eligibility. Callers persist to eligibility_rule_drafts as pending.
 */

export const DRAFTER_VERSION = 'heuristic-v1';

const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

const ATTRIBUTE_RULES: ReadonlyArray<{ key: string; pattern: RegExp; reason: string }> = [
  {
    key: 'had_data_breach',
    pattern:
      /\bdata[\s-]+breach(?:es)?\b|\bbreach notice\b|\bnotification (?:of|that).{0,40}(?:exposed|stolen|compromised)\b|\bpersonal (?:info|information|data) (?:was |were )?(?:exposed|stolen|compromised)\b/i,
    reason: 'Listing mentions a data-breach notice or exposed personal information',
  },
  {
    key: 'owns_vehicle',
    pattern:
      /\b(?:vehicle|vehicles|automobile|automobiles|car|cars|truck|trucks|suv|suvs|motor vehicle)\b/i,
    reason: 'Listing mentions vehicles',
  },
  {
    key: 'used_banking',
    pattern:
      /\b(?:bank account|checking account|savings account|overdraft|debit card|credit (?:card|account)|banking (?:customer|account))\b/i,
    reason: 'Listing mentions a bank or credit account',
  },
  {
    key: 'bought_consumer_goods',
    pattern:
      /\b(?:purchased|bought|buyers? of).{0,40}(?:product|supplement|food|beverage|household)\b|\bconsumer product\b/i,
    reason: 'Listing mentions a purchased consumer product',
  },
  {
    key: 'uses_social_media',
    pattern: /\b(?:facebook|instagram|tiktok|meta|google account|social[\s-]+media)\b/i,
    reason: 'Listing mentions a social or Google account',
  },
  {
    key: 'used_streaming',
    pattern: /\b(?:streaming|netflix|hulu|disney\+|subscription service|telecom)\b/i,
    reason: 'Listing mentions a streaming or subscription service',
  },
  {
    key: 'employed_hourly',
    pattern: /\b(?:hourly|overtime|wage|gig (?:work|job|worker)|independent contractor)\b/i,
    reason: 'Listing mentions hourly or gig work',
  },
];

const VEHICLE_BRANDS = ['Toyota', 'Honda', 'Ford', 'GM', 'Kia', 'Hyundai', 'Tesla'] as const;

export interface EligibilityDraft {
  eligibility: EligibilityCriteria;
  rationale: {
    version: string;
    states: string[];
    requires: Array<{ key: string; reason: string }>;
    anyOf: Record<string, string>;
  };
}

export function listingSourceText(
  lawsuit: Pick<Lawsuit, 'title' | 'summary' | 'description' | 'eligibility_text'>,
): string {
  return [lawsuit.title, lawsuit.summary, lawsuit.description, lawsuit.eligibility_text]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n');
}

export function extractStates(text: string): string[] {
  const found = new Set<string>();
  if (/\bnationwide\b|\ball 50 states\b|\bunited states residents?\b/i.test(text)) {
    return [];
  }
  for (const state of US_STATES) {
    const nameRe = new RegExp(`\\b${state.name.replace(/ /g, '\\s+')}\\b`, 'i');
    const codeRe = new RegExp(`\\b${state.code}\\b`);
    if (nameRe.test(text) || codeRe.test(text)) found.add(state.code);
  }
  return [...found].sort();
}

export function draftEligibilityFromText(text: string): EligibilityDraft {
  const rationale: EligibilityDraft['rationale'] = {
    version: DRAFTER_VERSION,
    states: [],
    requires: [],
    anyOf: {},
  };
  const eligibility: EligibilityCriteria = {};

  const states = extractStates(text);
  if (states.length > 0) {
    eligibility.states = states;
    rationale.states = states;
  }

  const requires: string[] = [];
  for (const rule of ATTRIBUTE_RULES) {
    if (HEALTH_FEATURE_KEYS.has(rule.key)) continue;
    if (rule.pattern.test(text)) {
      requires.push(rule.key);
      rationale.requires.push({ key: rule.key, reason: rule.reason });
    }
  }
  if (requires.length > 0) eligibility.requires = requires;

  const brands = VEHICLE_BRANDS.filter((brand) => new RegExp(`\\b${brand}\\b`, 'i').test(text));
  if (brands.length > 0) {
    eligibility.anyOf = { ...(eligibility.anyOf ?? {}), vehicle_brands: [...brands] };
    rationale.anyOf.vehicle_brands = `Named brands: ${brands.join(', ')}`;
  }

  return { eligibility, rationale };
}

export function hasStructuredRules(criteria: EligibilityCriteria | null | undefined): boolean {
  if (!criteria) return false;
  const hasStates = !!(criteria.states && criteria.states.length > 0);
  const hasRequires = !!(criteria.requires && criteria.requires.length > 0);
  const hasAnyOf = !!(criteria.anyOf && Object.keys(criteria.anyOf).length > 0);
  return hasStates || hasRequires || hasAnyOf;
}

export function draftEligibilityForLawsuit(
  lawsuit: Pick<Lawsuit, 'title' | 'summary' | 'description' | 'eligibility_text' | 'eligibility'>,
): EligibilityDraft | null {
  if (hasStructuredRules(lawsuit.eligibility)) return null;
  const text = listingSourceText(lawsuit);
  if (!text.trim()) return null;
  const draft = draftEligibilityFromText(text);
  if (!hasStructuredRules(draft.eligibility)) return null;
  return draft;
}
