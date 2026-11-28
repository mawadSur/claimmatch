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
  // Prefer a word boundary unless it would throw away more than half the text.
  const minKeep = max >= 155 ? 80 : Math.floor(max / 2);
  const cut = lastSpace > minKeep ? sliced.slice(0, lastSpace) : sliced;
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

/**
 * Only the unfiltered catalog (and its ?page=N pages) is indexable. A
 * category-only view canonicalizes to its category hub; search, proof,
 * deadline, file-for-you and opening-soon views are noindex,follow so
 * crawlers still reach the settlement pages without indexing thin
 * duplicate lists.
 */
export function catalogIndexing(filters: {
  q?: string;
  category?: string;
  hasDeadline?: boolean;
  proof?: unknown;
  fileForYou?: boolean;
  openingSoon?: boolean;
  page: number;
}): { index: boolean; canonicalPath: string | null } {
  const other = Boolean(
    filters.q || filters.hasDeadline || filters.proof || filters.fileForYou || filters.openingSoon,
  );
  if (!other && !filters.category) return { index: true, canonicalPath: null };
  if (!other && filters.category && filters.page <= 1) {
    return { index: true, canonicalPath: categoryHubPath(filters.category) };
  }
  return { index: false, canonicalPath: null };
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
const NO_FILE_META = 'No claim needed — you will be paid automatically if you qualify.';

function noFileClaim(lawsuit: Pick<Lawsuit, 'claim_action_type'>): boolean {
  return lawsuit.claim_action_type === 'automatic_payment' || lawsuit.claim_action_type === 'not_open';
}

function mayFileLine(
  lawsuit: Pick<Lawsuit, 'claim_action_type'>,
  filingMode: SettlementSeoFilingMode | null = null,
): string {
  if (noFileClaim(lawsuit)) return NO_FILE_META;
  if (filingMode === 'agent') return WE_FILE_THIS_CLAIM_META;
  return HELP_FILE_META;
}

/** Avoid "stated.." when the catalog value already ends with a period. */
export function withTerminalPeriod(text: string): string {
  const t = text.trim();
  return /[.!?…]['"”’)\]]*$/.test(t) ? t : `${t}.`;
}

function hasQualifies(
  lawsuit: Pick<Lawsuit, 'eligibility_text'>,
): boolean {
  return Boolean(eligibilitySummary(lawsuit.eligibility_text));
}

function hasDeadline(lawsuit: Pick<Lawsuit, 'deadline'>): boolean {
  return Boolean(lawsuit.deadline);
}

/**
 * Longest settlement title body we emit. The layout template adds
 * " · Lawsuit AI", and Google cuts titles at roughly 60 characters, so long
 * catalog names would otherwise lose the deadline / payout words entirely.
 */
export const SETTLEMENT_TITLE_MAX = 60;

/**
 * Shorter form of a catalog title for page titles: "Acme - Data Breach Class
 * Action Settlement" → "Acme Data Breach Settlement". Only drops words; never
 * adds or reorders facts.
 */
export function shortSettlementName(title: string): string {
  return title
    .replace(/\s+[-–—|]\s+/g, ' ')
    .replace(/\bclass[- ]action settlement\b/gi, 'Settlement')
    .replace(/\bclass[- ]action lawsuit\b/gi, 'Lawsuit')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Name used inside questions ("Am I eligible for the … ?"). Bare case names
 * like "Welch" or "Naro v. Walgreen Co." read as "the Welch settlement".
 */
export function settlementQuestionName(title: string): string {
  const name = title.trim();
  return /\b(settlement|lawsuit|litigation|class action|multidistrict)\b/i.test(name)
    ? name
    : `${name} settlement`;
}

function titleSuffixes(
  lawsuit: Pick<Lawsuit, 'deadline' | 'eligibility_text' | 'typical_payout'>,
): string[] {
  const payout = Boolean(lawsuit.typical_payout?.trim());
  if (hasDeadline(lawsuit) && hasQualifies(lawsuit)) {
    return payout
      ? [
          'Who Qualifies, Claim Deadline & Payout',
          'Who Qualifies & Claim Deadline',
          'Claim Deadline & Payout',
          'Claim Deadline',
          'Deadline',
        ]
      : ['Who Qualifies & Claim Deadline', 'Claim Deadline', 'Deadline'];
  }
  if (hasDeadline(lawsuit)) {
    return payout
      ? ['Claim Deadline & Payout', 'Claim Deadline', 'Deadline']
      : ['Claim Deadline', 'Deadline'];
  }
  if (payout) {
    return [`Payout & ${FALLBACK_META_SUFFIX}`, 'Payout & Official Claim Link', 'Official Claim Link'];
  }
  return [FALLBACK_META_SUFFIX, 'Official Claim Link'];
}

/**
 * Title never names Who Qualifies or Deadline unless those fields exist, and
 * stays within SETTLEMENT_TITLE_MAX characters: it drops suffix words first,
 * then shortens the name, then truncates the name at a word boundary.
 */
export function settlementMetaTitle(
  lawsuit: Pick<Lawsuit, 'title' | 'deadline' | 'eligibility_text' | 'typical_payout'>,
): string {
  const title = lawsuit.title.trim();
  const short = shortSettlementName(title);
  const names = short && short !== title ? [title, short] : [title];
  for (const suffix of titleSuffixes(lawsuit)) {
    for (const name of names) {
      const candidate = `${name}: ${suffix}`;
      if (candidate.length <= SETTLEMENT_TITLE_MAX) return candidate;
    }
  }
  const name = short || title;
  if (name.length <= SETTLEMENT_TITLE_MAX) return name;
  return truncateAtWord(name, SETTLEMENT_TITLE_MAX);
}

export function settlementMetaDescription(
  lawsuit: Lawsuit,
  filingMode: SettlementSeoFilingMode | null = null,
): string {
  const title = lawsuit.title.trim();
  const qualifies = hasQualifies(lawsuit);
  const dated = hasDeadline(lawsuit);
  const fileLine = mayFileLine(lawsuit, filingMode);
  if (!qualifies || !dated) {
    const payout = lawsuit.typical_payout?.trim()
      ? ` Listed payout: ${withTerminalPeriod(lawsuit.typical_payout.trim())}`
      : '';
    return truncateAtWord(
      `${title}: official claim link and what we know.${payout} ${fileLine}`,
      155,
    );
  }
  const deadline = `Claim deadline ${formatDeadline(lawsuit.deadline)}.`;
  const payout = lawsuit.typical_payout?.trim()
    ? `Listed payout: ${withTerminalPeriod(lawsuit.typical_payout.trim())}`
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

/**
 * "Listing updated" date for the page and /llms-full.txt, as the
 * America/New_York calendar day of updated_at (the same value the Article
 * JSON-LD sends as dateModified). Null when the timestamp is missing or bad.
 */
export function listingUpdatedOn(
  updatedAt: string | null | undefined,
): { iso: string; label: string } | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return { iso, label: formatDeadline(iso) };
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
  const name = settlementQuestionName(lawsuit.title);
  const facts = settlementAnswerFacts(lawsuit);
  const eligibility = eligibilitySummary(lawsuit.eligibility_text);
  const official = officialLinkFor(lawsuit);

  const noFile = noFileClaim(lawsuit);
  const filingLine = noFile
    ? ''
    : agentLane
      ? ' We file this claim for you after you review and sign it. You can always file on the official site yourself instead, where filing is free.'
      : ' We help you file. You can always file on the official site yourself, where filing is free.';
  const officialHow =
    official?.kind === 'official'
      ? ` File on the official site (${official.host}).${filingLine}`
      : ` File on the official settlement website.${filingLine}`;
  const payout = lawsuit.typical_payout?.trim();

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
      a: payout
        ? `The listing states the payout as ${payout.replace(/[.]+$/, '')}. The amount you get depends on the settlement’s rules and how many people file. The official notice is the final word.`
        : `This listing does not state a payout amount. The official notice has the payment rules.`,
    },
    {
      q: `Who is the administrator for the ${name}?`,
      a: lawsuit.administrator?.trim()
        ? `Our listing names ${lawsuit.administrator.trim()} as the administrator. Confirm that on the official notice.`
        : `This listing does not name an administrator. The official notice says who runs the claims process.`,
    },
    noFile
      ? {
          q: `Do I need to file a claim for the ${name}?`,
          a: `No. No claim is needed — you will be paid automatically if you qualify. Keep your mailing address current with the settlement administrator so they can send your payment. Confirm the details on the official site.`,
        }
      : {
          q: `Can I file a ${name} claim for free without Lawsuit AI?`,
          a: `Yes. Anyone can file for free on the official settlement website. You never need a Lawsuit AI account to file.${officialHow}`,
        },
    noFile
      ? {
          q: `Can I check the ${name} without a Lawsuit AI account?`,
          a: `Yes. Anyone can open the official site with no Lawsuit AI account. There is nothing to file here.`,
        }
      : {
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
    author: { '@type': 'Organization', '@id': `${pageUrl('/')}/#organization`, name: SITE.name, url: pageUrl('/') },
    publisher: { '@type': 'Organization', '@id': `${pageUrl('/')}/#organization`, name: SITE.name, url: pageUrl('/') },
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
  const noFile = noFileClaim(lawsuit);
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
            name: noFile
              ? 'No claim needed'
              : agent
                ? 'We file this claim for you'
                : 'We help you file',
            description: noFile
              ? 'No claim needed — you will be paid automatically if you qualify. Keep your mailing address current with the settlement administrator.'
              : agent
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
