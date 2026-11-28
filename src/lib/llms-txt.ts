/**
 * /llms.txt body (llmstxt.org). Google ignores this file; other tools may read
 * it. Copy is reused from SITE + legal/fee strings already on the site — no
 * new fee or legal claims.
 */

import { OFFICIAL_FILING_IS_FREE, membershipCopy, publicBetaFeeCopy } from '@/lib/copy';
import { shortDisclaimer } from '@/lib/disclaimer-flags';
import { flags } from '@/lib/flags';
import { hasOfficialNoticeGuide } from '@/lib/settlement-guides';
import {
  categoryHubPath,
  CLOSING_SOON_PATH,
  CLOSING_THIS_MONTH_PATH,
  FEATURED_CATEGORY_HUBS,
  NEW_SETTLEMENTS_PATH,
  NO_PROOF_PATH,
  pageUrl,
  listingUpdatedOn,
  settlementAnswerFacts,
  settlementPath,
  truncateAtWord,
} from '@/lib/settlement-seo';
import { isThinSettlement } from '@/lib/catalog-page';
import { officialLinkFor } from '@/lib/lawsuit-display';
import { overlayVerifiedFacts } from '@/lib/verified-fields';
import type { Lawsuit } from '@/lib/types';
import { PUBLIC_BRAND, publicBrandCopy, SITE } from '@/lib/utils';

export const LLMS_FULL_PATH = '/llms-full.txt';

export interface LlmsHubLink {
  name: string;
  path: string;
}

const FALLBACK_CATEGORY_HUBS: LlmsHubLink[] = FEATURED_CATEGORY_HUBS.map((name) => ({
  name,
  path: categoryHubPath(name),
}));

const STATIC_HUBS: LlmsHubLink[] = [
  { name: 'Open settlements', path: '/lawsuits' },
  { name: 'Settlements closing soon', path: CLOSING_SOON_PATH },
  { name: 'Settlements closing this month', path: CLOSING_THIS_MONTH_PATH },
  { name: 'Settlements with no proof required', path: NO_PROOF_PATH },
  { name: 'New settlements', path: NEW_SETTLEMENTS_PATH },
];

const ABOUT_LINKS: LlmsHubLink[] = [
  { name: 'How it works', path: '/how-it-works' },
  { name: 'Trust and editorial policy', path: '/trust' },
  { name: 'Privacy', path: '/privacy' },
  { name: 'Terms', path: '/terms' },
];

/** Category hubs ranked by how many open catalog rows they have. */
export function catalogHubLinks(
  lawsuits: readonly { category?: string | null }[],
  limit = 6,
): LlmsHubLink[] {
  const counts = new Map<string, number>();
  for (const row of lawsuits) {
    const category = row.category?.trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => ({ name, path: categoryHubPath(name) }));
  return ranked.length > 0 ? ranked : FALLBACK_CATEGORY_HUBS;
}

/** Open catalog rows that have an official-notice guide, for /llms.txt internal links. */
export function officialGuideLinks(
  lawsuits: readonly { slug?: string | null; title?: string | null }[],
): LlmsHubLink[] {
  const out: LlmsHubLink[] = [];
  const seen = new Set<string>();
  for (const row of lawsuits) {
    const slug = row.slug?.trim();
    if (!slug || seen.has(slug) || !hasOfficialNoticeGuide(slug)) continue;
    seen.add(slug);
    out.push({ name: row.title?.trim() || slug, path: settlementPath(slug) });
  }
  return out;
}

function markdownList(links: readonly LlmsHubLink[]): string {
  return links.map((link) => `- [${link.name}](${pageUrl(link.path)})`).join('\n');
}

/**
 * Plain-text /llms.txt. `feeLine` defaults to the live public fee sentence
 * (membership when SUBSCRIPTION_BILLING_ENABLED=1, otherwise beta).
 */
export function renderLlmsTxt(input: {
  categoryHubs?: readonly LlmsHubLink[];
  officialGuides?: readonly LlmsHubLink[];
  feeLine?: string;
} = {}): string {
  const categoryHubs = input.categoryHubs ?? FALLBACK_CATEGORY_HUBS;
  const officialGuides = input.officialGuides ?? [];
  const feeLine = input.feeLine ?? (flags.feeDisclosure() ? membershipCopy() : publicBetaFeeCopy());
  const guidesSection =
    officialGuides.length > 0
      ? `\n## Official-notice settlement guides\n\n${markdownList(officialGuides)}\n`
      : '';
  return `# ${PUBLIC_BRAND}

> ${SITE.description}

${publicBrandCopy(shortDisclaimer())}

${OFFICIAL_FILING_IS_FREE} ${publicBrandCopy(feeLine)}

Matching on ${PUBLIC_BRAND} is free.

## Settlement hubs

${markdownList(STATIC_HUBS)}
${markdownList(categoryHubs)}
${guidesSection}
## About

${markdownList(ABOUT_LINKS)}

## Full catalog

- [Every open settlement with its deadline, listed payout, proof and official link](${pageUrl(LLMS_FULL_PATH)})

## Data source

Settlement catalog data includes [SettleSignal](https://settlesignal.com/data/), CC BY 4.0. Listings are unverified — check the official notice before you file.

Site: ${SITE.url}
`;
}

/** Stable fallback used when the catalog cannot be read. */
export function fallbackLlmsTxt(): string {
  return renderLlmsTxt({ categoryHubs: FALLBACK_CATEGORY_HUBS });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function byDeadlineThenTitle(a: Lawsuit, b: Lawsuit): number {
  const da = a.deadline?.slice(0, 10) ?? '';
  const db = b.deadline?.slice(0, 10) ?? '';
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.title.localeCompare(b.title);
}

/** One settlement block for /llms-full.txt. Only catalog fields; empty facts are left out. */
export function llmsSettlementBlock(lawsuit: Lawsuit): string {
  const facts = overlayVerifiedFacts(settlementAnswerFacts(lawsuit, true), lawsuit);
  const official = officialLinkFor(lawsuit);
  const lines: string[] = [`## ${oneLine(lawsuit.title)}`, ''];
  lines.push(`- Page: ${pageUrl(settlementPath(lawsuit.slug))}`);
  if (lawsuit.category?.trim()) lines.push(`- Category: ${oneLine(lawsuit.category)}`);
  if (facts.deadline) lines.push(`- Claim deadline: ${facts.deadline}`);
  if (facts.payout) lines.push(`- Listed payout: ${oneLine(facts.payout)}`);
  if (facts.proof) lines.push(`- Proof: ${oneLine(facts.proof)}`);
  if (facts.qualifies) lines.push(`- Who qualifies (listing summary): ${truncateAtWord(oneLine(facts.qualifies), 300)}`);
  if (facts.administrator) lines.push(`- Administrator: ${oneLine(facts.administrator)}`);
  if (official?.kind === 'official') lines.push(`- Official claim site: ${official.href}`);
  const updated = listingUpdatedOn(lawsuit.updated_at);
  if (updated) lines.push(`- Listing updated: ${updated.iso}`);
  return lines.join('\n');
}

/**
 * /llms-full.txt: every indexable open settlement with its answer facts, so
 * answer engines can quote a deadline / payout / proof rule and cite both our
 * page and the official site. Same rows as the sitemap (open, not thin).
 */
export function renderLlmsFullTxt(lawsuits: readonly Lawsuit[], now: Date = new Date()): string {
  const rows = lawsuits.filter((l) => !isThinSettlement(l)).slice().sort(byDeadlineThenTitle);
  const header = `# ${PUBLIC_BRAND}: open class action settlements (full list)

> ${SITE.description}

${publicBrandCopy(shortDisclaimer())}

${OFFICIAL_FILING_IS_FREE}

Generated ${now.toISOString().slice(0, 10)}. ${rows.length} open ${rows.length === 1 ? 'settlement' : 'settlements'}, soonest deadline first. Each entry comes from our catalog listing; the official notice is the final word on who qualifies, the deadline and the payout. Listings without a deadline are at the end.

Short summary: ${pageUrl('/llms.txt')}
`;
  const body = rows.map(llmsSettlementBlock).join('\n\n');
  return `${header}\n${body}${body ? '\n' : ''}\nData source: settlement catalog data includes SettleSignal (https://settlesignal.com/data/), CC BY 4.0.\nSite: ${SITE.url}\n`;
}
