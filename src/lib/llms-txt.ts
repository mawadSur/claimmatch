/**
 * /llms.txt body (llmstxt.org). Google ignores this file; other tools may read
 * it. Copy is reused from SITE + legal/fee strings already on the site — no
 * new fee or legal claims.
 */

import { BETA_FEE_COPY, OFFICIAL_FILING_IS_FREE, publicBetaFeeCopy } from '@/lib/copy';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { categoryHubPath, CLOSING_SOON_PATH, NEW_SETTLEMENTS_PATH, pageUrl } from '@/lib/settlement-seo';
import { LAWSUIT_CATEGORIES } from '@/lib/types';
import { PUBLIC_BRAND, publicBrandCopy, SITE } from '@/lib/utils';

export interface LlmsHubLink {
  name: string;
  path: string;
}

const FALLBACK_CATEGORY_HUBS: LlmsHubLink[] = LAWSUIT_CATEGORIES.slice(0, 6).map((name) => ({
  name,
  path: categoryHubPath(name),
}));

const STATIC_HUBS: LlmsHubLink[] = [
  { name: 'Open settlements', path: '/lawsuits' },
  { name: 'Settlements closing soon', path: CLOSING_SOON_PATH },
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

function markdownList(links: readonly LlmsHubLink[]): string {
  return links.map((link) => `- [${link.name}](${pageUrl(link.path)})`).join('\n');
}

/**
 * Plain-text /llms.txt. `feeLine` defaults to the live public beta sentence so
 * tests can pin a string without flipping PANEL_TRUST_COPY_ENABLED.
 */
export function renderLlmsTxt(input: {
  categoryHubs?: readonly LlmsHubLink[];
  feeLine?: string;
} = {}): string {
  const categoryHubs = input.categoryHubs ?? FALLBACK_CATEGORY_HUBS;
  const feeLine = input.feeLine ?? publicBetaFeeCopy();
  return `# ${PUBLIC_BRAND}

> ${SITE.description}

${publicBrandCopy(SHORT_DISCLAIMER)}

${OFFICIAL_FILING_IS_FREE} ${publicBrandCopy(feeLine)}

Matching on ${PUBLIC_BRAND} is free.

## Settlement hubs

${markdownList(STATIC_HUBS)}
${markdownList(categoryHubs)}

## About

${markdownList(ABOUT_LINKS)}

## Data source

Settlement catalog data includes [SettleSignal](https://settlesignal.com/data/), CC BY 4.0. Listings are unverified — check the official notice before you file.

Site: ${SITE.url}
`;
}

/** Stable fallback used when the catalog cannot be read. */
export function fallbackLlmsTxt(): string {
  return renderLlmsTxt({ categoryHubs: FALLBACK_CATEGORY_HUBS, feeLine: BETA_FEE_COPY });
}
