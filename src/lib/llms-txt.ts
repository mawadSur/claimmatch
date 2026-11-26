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
  settlementPath,
} from '@/lib/settlement-seo';
import { PUBLIC_BRAND, publicBrandCopy, SITE } from '@/lib/utils';

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

## Data source

Settlement catalog data includes [SettleSignal](https://settlesignal.com/data/), CC BY 4.0. Listings are unverified — check the official notice before you file.

Site: ${SITE.url}
`;
}

/** Stable fallback used when the catalog cannot be read. */
export function fallbackLlmsTxt(): string {
  return renderLlmsTxt({ categoryHubs: FALLBACK_CATEGORY_HUBS });
}
