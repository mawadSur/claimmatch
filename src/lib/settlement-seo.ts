import { eligibilitySummary } from '@/lib/claim-input';
import { officialLinkFor } from '@/lib/lawsuits';
import { proofDetail, proofLabel } from '@/lib/proof';
import { LAWSUIT_CATEGORIES, type Lawsuit } from '@/lib/types';
import { formatDeadline, SITE, slugify } from '@/lib/utils';

/** Hourly ISR. Page files must export `revalidate = 3600` as a literal. */

export interface FaqItem {
  q: string;
  a: string;
}

export interface AnswerFacts {
  /** Listing text, or null when we have no real eligibility rule. */
  qualifies: string | null;
  payout: string;
  /** Formatted deadline, or null when the listing has none. */
  deadline: string | null;
  proof: string;
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
export const NEW_SETTLEMENTS_PATH = '/settlements/new';
export { RECENTLY_CLOSED_PATH } from '@/lib/recently-closed';

const FALLBACK_META_SUFFIX = 'Official Claim Link & What We Know';

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
  lawsuit: Pick<Lawsuit, 'title' | 'deadline' | 'eligibility_text'>,
): string {
  const title = lawsuit.title.trim();
  if (hasDeadline(lawsuit) && hasQualifies(lawsuit)) {
    return `${title}: Who Qualifies, Claim Deadline & Payout`;
  }
  return `${title}: ${FALLBACK_META_SUFFIX}`;
}

export function settlementMetaDescription(lawsuit: Lawsuit): string {
  const title = lawsuit.title.trim();
  const qualifies = hasQualifies(lawsuit);
  const dated = hasDeadline(lawsuit);
  if (!qualifies || !dated) {
    const payout = lawsuit.typical_payout?.trim()
      ? ` Listed payout: ${lawsuit.typical_payout.trim()}.`
      : '';
    return truncateAtWord(
      `${title}: official claim link and what we know.${payout} File free on the official site.`,
      155,
    );
  }
  const deadline = `Claim deadline ${formatDeadline(lawsuit.deadline)}.`;
  const payout = lawsuit.typical_payout?.trim()
    ? `Listed payout: ${lawsuit.typical_payout.trim()}.`
    : '';
  const proof = `Proof: ${proofLabel(lawsuit)}.`;
  const raw = [
    `See who may qualify for the ${title}.`,
    deadline,
    proof,
    payout,
    'File free on the official site.',
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
export function settlementAnswerFacts(lawsuit: Lawsuit): AnswerFacts {
  const qualifies = eligibilitySummary(lawsuit.eligibility_text);
  const administrator = lawsuit.administrator?.trim() || null;
  return {
    qualifies,
    payout: listedOrFallback(lawsuit.typical_payout, 'Not stated'),
    deadline: lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null,
    proof: proofLabel(lawsuit),
    administrator,
    missing: missingAnswerDetails(lawsuit),
  };
}

/**
 * FAQ answers are built only from stored fields plus product facts (you file
 * on the official site). No invented payouts, reviews or testimonials.
 */
export function settlementFaqs(lawsuit: Lawsuit): FaqItem[] {
  const name = lawsuit.title.trim();
  const facts = settlementAnswerFacts(lawsuit);
  const eligibility = eligibilitySummary(lawsuit.eligibility_text);
  const official = officialLinkFor(lawsuit);

  const officialHow =
    official?.kind === 'official'
      ? ` File on the official site (${official.host}). ClaimMatch never files for you.`
      : ' File on the official settlement website. ClaimMatch never files for you.';

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
      a: proofDetail(lawsuit),
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
      q: `How do I file a claim for the ${name}?`,
      a: `Check that you qualify on the official notice, then file on the official site yourself. Filing there is free.${officialHow}`,
    },
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

/** Informational Article about one settlement (no LegalService — we are not a law firm). */
export function settlementArticleJsonLd(lawsuit: Lawsuit) {
  const url = pageUrl(settlementPath(lawsuit.slug));
  const official = officialLinkFor(lawsuit);
  const facts = settlementAnswerFacts(lawsuit);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: settlementMetaTitle(lawsuit),
    name: lawsuit.title,
    description: settlementMetaDescription(lawsuit),
    url,
    mainEntityOfPage: url,
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
        `Listed payout: ${facts.payout}`,
        `Proof: ${facts.proof}`,
        facts.administrator ? `Administrator: ${facts.administrator}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      ...(official ? { url: official.href } : {}),
    },
    ...(official ? { isBasedOn: official.href } : {}),
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
