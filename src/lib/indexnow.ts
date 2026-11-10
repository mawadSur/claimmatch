import { flags } from '@/lib/flags';
import { pageUrl, settlementPath } from '@/lib/settlement-seo';
import { isFictionalSlug } from '@/lib/fictional-slugs';
import { SITE } from '@/lib/utils';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
/** Compatibility alias used by the rewrite target. Standard path is /{key}.txt. */
export const INDEXNOW_KEY_PATH = '/indexnow-key.txt';
export const INDEXNOW_BATCH_SIZE = 1000;

const KEY_OK = /^[A-Za-z0-9]{8,128}$/;

export type IndexNowResult =
  | { submitted: number; skipped: string }
  | { submitted: number; status: number };

export function indexNowKey(raw = process.env.INDEXNOW_KEY): string | null {
  const key = raw?.trim() ?? '';
  return KEY_OK.test(key) ? key : null;
}

/** Standard IndexNow key file path: /{key}.txt */
export function indexNowStandardKeyPath(key: string): string {
  return `/${key}.txt`;
}

export function indexNowKeyFileRequest(pathname: string, key = indexNowKey()): boolean {
  if (!key) return false;
  return pathname === indexNowStandardKeyPath(key);
}

/**
 * Tests, Vitest workers, and dry runs never ping IndexNow unless a unit test
 * passes allowInTest with a mocked fetchImpl.
 */
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

export function indexNowKeyLocation(siteUrl = SITE.url, key = indexNowKey()): string {
  const base = siteUrl.replace(/\/$/, '');
  if (key) return `${base}${indexNowStandardKeyPath(key)}`;
  return `${base}${INDEXNOW_KEY_PATH}`;
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
    keyLocation: indexNowKeyLocation(siteUrl, key),
    urlList: urls,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [Array.from(items)];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function submitIndexNowUrls(
  slugs: readonly string[],
  opts: { fetchImpl?: typeof fetch; dryRun?: boolean; allowInTest?: boolean } = {},
): Promise<IndexNowResult> {
  if (opts.dryRun) return { submitted: 0, skipped: 'dry-run' };
  if (!opts.allowInTest && !indexNowShouldRun()) return { submitted: 0, skipped: 'disabled' };
  if (opts.allowInTest && !flags.indexNow()) return { submitted: 0, skipped: 'disabled' };
  const key = indexNowKey();
  if (!key) return { submitted: 0, skipped: 'missing-key' };
  const urls = indexNowUrlsForSlugs(slugs);
  if (urls.length === 0) return { submitted: 0, skipped: 'empty' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const batches = chunk(urls, INDEXNOW_BATCH_SIZE);
  let lastStatus = 0;
  for (const batch of batches) {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowPayload(batch, key)),
    });
    lastStatus = res.status;
    if (!res.ok) {
      console.warn(`[indexnow] ${res.status} submitting ${batch.length} URLs`);
    }
  }
  return { submitted: urls.length, status: lastStatus };
}

/**
 * Best-effort IndexNow ping. Never throws, so ingest and admin writes cannot
 * fail because a search engine was unreachable.
 */
export async function notifyIndexNowBestEffort(
  slugs: readonly string[],
  opts: { fetchImpl?: typeof fetch; dryRun?: boolean; allowInTest?: boolean } = {},
): Promise<IndexNowResult> {
  try {
    return await submitIndexNowUrls(slugs, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'indexnow error';
    console.warn('[indexnow] failed:', message);
    return { submitted: 0, skipped: 'error' };
  }
}

const PUBLIC_NOTIFY_ACTIONS = new Set([
  'publish',
  'bulk_publish',
  'reject',
  'update',
  'close_missing',
]);

/** Admin catalog writes that change a public settlement page. */
export function shouldNotifyIndexNowForAdminAction(action: string): boolean {
  return PUBLIC_NOTIFY_ACTIONS.has(action);
}
