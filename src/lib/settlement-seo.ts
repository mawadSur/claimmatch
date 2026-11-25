import { hideUnknownSettlementFacts } from './catalog-unknowns';
import { eligibilitySummary } from './claim-input';
import { officialLinkFor } from './lawsuit-display';
import { proofLabel, proofStatus } from './proof';
import { settlementGuideFaqs, settlementProofDetail } from './settlement-guides';
import { LAWSUIT_CATEGORIES, type Lawsuit } from './types';
import { formatDeadline, SITE, slugify } from './utils';

/** Inlined: this file is shared with the app and cannot import copy.ts. */
export type SettlementSeoFilingMode = 'never_files' | 'agent' | 'self_file';

/** Hourly ISR. Page files must export `revalidate = 3600` as a literal. */

export interface FaqItem {
  q: string;
  a: string;
}

export interface AnswerFacts {
  /** Listing text, or null when we have no real eligibility rule. */
  qualifies: string | null;
  /** Listed payout, or null when unknown and hide-unknown is on. */
  payout: string | null;
  /** Formatted deadline, or null when the listing has none. */
  deadline: string | null;
  /** Proof label, or null when unknown and hide-unknown is on. */
  proof: string | null;
  /** Administrator name, or null when the listing has none. */
  administrator: string | null;
  /** Human labels for empty who-qualifies / deadline / administrator. */
  missing: string[];
}

/** Absolute URL for a site path (`/` → origin). */
export function pageUrl(path = '/'): string {
  const base = SITE.url.replace(/\/$/, '');
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** ~155 characters, truncated at a word boundary. Never invents wording. */
export function truncateAtWord(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[.,;:–-]+$/, '')}…`;
}

export function categorySlug(category: string): string {
  return slugify(category);
}

/** Known catalog categories plus any live labels, mapped by slug. */
export function resolveCategoryName(slug: string, liveCategories: string[] = []): string | null {
  const needle = slugify(slug);
  if (!needle) return null;
  const known = LAWSUIT_CATEGORIES.find((c) => slugify(c) === needle);
  if (known) return known;
  return liveCategories.find((c) => slugify(c) === needle) ?? null;
}

export function lawsuitsInCategory<T extends Pick<Lawsuit, 'category'>>(
  lawsuits: T[],
  category: string,
): T[] {
  const needle = slugify(category);
  return lawsuits.filter((l) => slugify(l.category) === needle);
}

export function settlementPath(slug: string): string {
  return `/lawsuits/${slug}`;
}

export function categoryHubPath(category: string): string {
  return `/settlements/category/${categorySlug(category)}`;
}

export const CLOSING_SOON_PATH = '/settlements/closing-soon';
export const CLOSING_THIS_MONTH_PATH = '/settlements/closing-this-month';
export const NO_PROOF_PATH = '/settlements/no-proof-required';
export const NEW_SETTLEMENTS_PATH = '/settlements/new';
export { RECENTLY_CLOSED_PATH } from './recently-closed';

/** Category hubs we always internally link, even when the live catalog is empty. */
export const FEATURED_CATEGORY_HUBS = [
  'Data Breach',
  'Consumer Products',
  'Auto & Vehicles',
  'Financial & Banking',
  'Privacy',
  'Employment',
] as const;

const FALLBACK_META_SUFFIX = 'Official Claim Link & What We Know';

/** Inlined from copy.ts — this file is shared with the app and cannot import it. */
const WE_FILE_THIS_CLAIM_META =
  'We file this claim for you. File free on the official site yourself anytime.';
const HELP_FILE_META = 'We help you file. File free on the official site yourself anytime.';

function mayFileLine(filingMode: SettlementSeoFilingMode | null = null): string {
  if (filingMode === 'agent') return WE_FILE_THIS_CLAIM_META;
  return HELP_FILE_META;
}

function hasQualifies(
  lawsuit: Pick<Lawsuit, 'eligibility_text'>,
): boolean {
  return Boolean(eligibilitySummary(lawsuit.eligibility_text));
}

function hasDeadline(lawsuit: Pick<Lawsuit, 'deadline'>): boolean {
  return Boolean(lawsuit.deadline);
}

/** Title never names Who Qualifies or Deadline unless those fields exist. */
export function settlementMetaTitle(
  lawsuit: Pick<Lawsuit, 'title' | 'deadline' | 'eligibility_text' | 'typical_payout'>,
): string {
  const title = lawsuit.title.trim();
  const payout = lawsuit.typical_payout?.trim();
  if (hasDeadline(lawsuit) && hasQualifies(lawsuit)) {
    return payout
      ? `${title}: Who Qualifies, Claim Deadline & Payout`
      : `${title}: Who Qualifies & Claim Deadline`;
  }
  if (hasDeadline(lawsuit)) {
    return payout ? `${title}: Claim Deadline & Payout` : `${title}: Claim Deadline`;
  }
  if (payout) return `${title}: Payout & ${FALLBACK_META_SUFFIX}`;
  return `${title}: ${FALLBACK_META_SUFFIX}`;
}

export function settlementMetaDescription(
  lawsuit: Lawsuit,
  filingMode: SettlementSeoFilingMode | null = null,
): string {
  const title = lawsuit.title.trim();
  const qualifies = hasQualifies(lawsuit);
  const dated = hasDeadline(lawsuit);
  const fileLine = mayFileLine(filingMode);
  if (!qualifies || !dated) {
    const payout = lawsuit.typical_payout?.trim()
      ? ` Listed payout: ${lawsuit.typical_payout.trim()}.`
      : '';
    return truncateAtWord(
      `${title}: official claim link and what we know.${payout} ${fileLine}`,
      155,
    );
  }
  const deadline = `Claim deadline ${formatDeadline(lawsuit.deadline)}.`;
  const payout = lawsuit.typical_payout?.trim()
    ? `Listed payout: ${lawsuit.typical_payout.trim()}.`
    : '';
  const hideProof = hideUnknownSettlementFacts() && proofStatus(lawsuit) === 'unknown';
  const proof = hideProof ? '' : `Proof: ${proofLabel(lawsuit)}.`;
  const raw = [
    `See who may qualify for the ${title}.`,
    deadline,
    proof,
    payout,
    fileLine,
  ]
    .filter(Boolean)
    .join(' ');
  return truncateAtWord(raw, 155);
}

export function listedOrFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

/** Empty who-qualifies / deadline / administrator labels for the honest block. */
export function missingAnswerDetails(
  lawsuit: Pick<Lawsuit, 'eligibility_text' | 'deadline' | 'administrator'>,
): string[] {
  const missing: string[] = [];
  if (!eligibilitySummary(lawsuit.eligibility_text)) missing.push('who qualifies');
  if (!lawsuit.deadline) missing.push('deadline');
  if (!lawsuit.administrator?.trim()) missing.push('administrator');
  return missing;
}

/** Facts shown in the plain-language answer block. Only catalog fields. */
export function settlementAnswerFacts(
  lawsuit: Lawsuit,
  hideUnknown = hideUnknownSettlementFacts(),
): AnswerFacts {
  const qualifies = eligibilitySummary(lawsuit.eligibility_text);
  const administrator = lawsuit.administrator?.trim() || null;
  const listedPayout = lawsuit.typical_payout?.trim() || null;
  const proof = proofLabel(lawsuit);
  const proofUnknown = proofStatus(lawsuit) === 'unknown';
  const missing = missingAnswerDetails(lawsuit);
  if (hideUnknown && proofUnknown) missing.push('proof');
  if (hideUnknown && !listedPayout) missing.push('listed payout');
  return {
    qualifies,
    payout: hideUnknown ? listedPayout : listedOrFallback(lawsuit.typical_payout, 'Not stated'),
    deadline: lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null,
    proof: hideUnknown && proofUnknown ? null : proof,
    administrator,
    missing,
  };
}

/**
 * FAQ answers are built only from stored fields plus product facts (you file
 * on the official site). No invented payouts, reviews or testimonials.
 */
export function settlementFaqs(
  lawsuit: Lawsuit,
  // Kept for callers; guide FAQs no longer branch on the site-wide may-file flag.
  _mayFile = false,
  /** True when this settlement has an agent lane (one-click enabled for it). */
  agentLane = false,
): FaqItem[] {
  const name = lawsuit.title.trim();
  const facts = settlementAnswerFacts(lawsuit);
  const eligibility = eligibilitySummary(lawsuit.eligibility_text);
  const official = officialLinkFor(lawsuit);

  const filingLine = agentLane
    ? ' We file this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.'
    : ' We help you file. You can always file on the official site yourself, where filing is free.';
  const officialHow =
    official?.kind === 'official'
      ? ` File on the official site (${official.host}).${filingLine}`
      : ` File on the official settlement website.${filingLine}`;

  return [
    {
      q: `Am I eligible for the ${name}?`,
      a: eligibility
        ? `Our listing says: ${eligibility} This is a short summary, not the official rules. Confirm who qualifies on the official notice before you file.`
        : `We don’t have the official rules for who qualifies for the ${name}. Read the official notice to see if you qualify.`,
    },
    {
      q: `What is the ${name} claim deadline?`,
      a: lawsuit.deadline
        ? `Our listing shows a claim deadline of ${facts.deadline}. Deadlines often end at 11:59 pm in the settlement’s time zone. Check the official site for the exact cutoff.`
        : `This listing has no deadline. Check the official site for the cutoff.`,
    },
    {
      q: `Do I need proof to file a ${name} claim?`,
      a: settlementProofDetail(lawsuit),
    },
    {
      q: `How much does the ${name} pay?`,
      a: lawsuit.typical_payout?.trim()
        ? `The listing states the payout as ${lawsuit.typical_payout.trim()}. The amount you get depends on the settlement’s rules and how many people file. The official notice is the final word.`
        : `This listing does not state a payout amount. The official notice has the payment rules.`,
    },
    {
      q: `Who is the administrator for the ${name}?`,
      a: lawsuit.administrator?.trim()
        ? `Our listing names ${lawsuit.administrator.trim()} as the administrator. Confirm that on the official notice.`
        : `This listing does not name an administrator. The official notice says who runs the claims process.`,
    },
    {
      q: `Can I file a ${name} claim for free without Lawsuit AI?`,
      a: `Yes. Anyone can file for free on the official settlement website. You never need a Lawsuit AI account to file.${officialHow}`,
    },
    {
      q: `How do I file a claim for the ${name}?`,
      a: agentLane
        ? `Check that you qualify on the official notice. We file this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.${officialHow}`
        : `Check that you qualify on the official notice. We help you file. You can always file on the official site yourself, where filing is free.${officialHow}`,
    },
    ...settlementGuideFaqs(lawsuit.slug),
  ];
}

export function faqJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: pageUrl(item.path),
    })),
  };
}

/** Informational Article about one settlement. */
export function settlementArticleJsonLd(
  lawsuit: Lawsuit,
  filingMode: SettlementSeoFilingMode | null = null,
) {
  const url = pageUrl(settlementPath(lawsuit.slug));
  const official = officialLinkFor(lawsuit);
  const facts = settlementAnswerFacts(lawsuit);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: settlementMetaTitle(lawsuit),
    name: lawsuit.title,
    description: settlementMetaDescription(lawsuit, filingMode),
    url,
    mainEntityOfPage: url,
    image: pageUrl(`/lawsuits/${lawsuit.slug}/opengraph-image`),
    dateModified: lawsuit.updated_at,
    datePublished: lawsuit.created_at,
    author: { '@type': 'Organization', name: SITE.name, url: pageUrl('/') },
    publisher: { '@type': 'Organization', name: SITE.name, url: pageUrl('/') },
    about: {
      '@type': 'Thing',
      name: lawsuit.title,
      description: [
        facts.qualifies ? `Who qualifies: ${facts.qualifies}` : null,
        facts.deadline ? `Claim deadline: ${facts.deadline}` : null,
        facts.payout ? `Listed payout: ${facts.payout}` : null,
        facts.proof ? `Proof: ${facts.proof}` : null,
        facts.administrator ? `Administrator: ${facts.administrator}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      ...(official ? { url: official.href } : {}),
    },
    ...(official ? { isBasedOn: official.href } : {}),
  };
}

/**
 * Claim-assistant LegalService node. Lawsuit AI is not a law firm; the
 * description says so. Agent-lane pages name “We file this claim for you”;
 * every other guide says “We help you file”.
 */
export function settlementLegalServiceJsonLd(
  lawsuit: Lawsuit,
  filingMode: SettlementSeoFilingMode | null = null,
) {
  const url = pageUrl(settlementPath(lawsuit.slug));
  const agent = filingMode === 'agent';
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: SITE.name,
    url: pageUrl('/'),
    description:
      'Lawsuit AI is a claim assistant, not a law firm. It helps people find open US class-action settlements and file claims on the official settlement website.',
    areaServed: { '@type': 'Country', name: 'United States' },
    serviceType: 'Class action claim assistant',
    provider: { '@type': 'Organization', name: SITE.name, url: pageUrl('/') },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: lawsuit.title,
      itemListElement: [
        {
          '@type': 'Offer',
          url,
          itemOffered: {
            '@type': 'Service',
            name: agent ? 'We file this claim for you' : 'We help you file',
            description: agent
              ? 'We file this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.'
              : 'We help you file. You can always file on the official site yourself, where filing is free.',
            url,
          },
        },
      ],
    },
  };
}

export function collectionJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  items: Array<{ name: string; path: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: pageUrl(opts.path),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: pageUrl(item.path),
      })),
    },
  };
}
