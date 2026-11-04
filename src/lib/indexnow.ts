import { flags } from '@/lib/flags';
import { pageUrl, settlementPath } from '@/lib/settlement-seo';
import { isFictionalSlug } from '@/lib/fictional-slugs';
import { SITE } from '@/lib/utils';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt';

const KEY_OK = /^[A-Za-z0-9]{8,128}$/;

export function indexNowKey(raw = process.env.INDEXNOW_KEY): string | null {
  const key = raw?.trim() ?? '';
  return KEY_OK.test(key) ? key : null;
}

/** Tests, Vitest workers, and dry runs never ping IndexNow. */
export function indexNowShouldRun(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === 'test') return false;
  if (env.VITEST || env.VITEST_WORKER_ID) return false;
  return flags.indexNow();
}

export function indexNowHost(siteUrl = SITE.url): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return 'lawsuitai.org';
  }
}

export function indexNowKeyLocation(siteUrl = SITE.url): string {
  return `${siteUrl.replace(/\/$/, '')}${INDEXNOW_KEY_PATH}`;
}

/** Public URLs for slugs the ingest touched. Drops fictional and empty values. */
export function indexNowUrlsForSlugs(slugs: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const raw of slugs) {
    const slug = raw?.trim();
    if (!slug || isFictionalSlug(slug)) continue;
    urls.add(pageUrl(settlementPath(slug)));
  }
  if (urls.size > 0) {
    urls.add(pageUrl('/lawsuits'));
  }
  return Array.from(urls);
}

export function indexNowPayload(urls: string[], key: string, siteUrl = SITE.url) {
  return {
    host: indexNowHost(siteUrl),
    key,
    keyLocation: `${siteUrl.replace(/\/$/, '')}${INDEXNOW_KEY_PATH}`,
    urlList: urls,
  };
}

export async function submitIndexNowUrls(
  slugs: readonly string[],
  opts: { fetchImpl?: typeof fetch; dryRun?: boolean } = {},
): Promise<{ submitted: number; skipped: string } | { submitted: number; status: number }> {
  if (opts.dryRun) return { submitted: 0, skipped: 'dry-run' };
  if (!indexNowShouldRun()) return { submitted: 0, skipped: 'disabled' };
  const key = indexNowKey();
  if (!key) return { submitted: 0, skipped: 'missing-key' };
  const urls = indexNowUrlsForSlugs(slugs);
  if (urls.length === 0) return { submitted: 0, skipped: 'empty' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowPayload(urls, key)),
  });
  if (!res.ok) {
    console.warn(`[indexnow] ${res.status} submitting ${urls.length} URLs`);
  }
  return { submitted: urls.length, status: res.status };
}
