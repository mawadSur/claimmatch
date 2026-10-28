import { flags } from '@/lib/flags';
import { notifyAdmins } from '@/lib/ingest-alerts';
import { createServiceClient } from '@/lib/supabase/server';

export const LINK_CHECK_USER_AGENT = 'ClaimMatchLinkCheck/1.0 (+https://lawsuitai.org)';
export const LINK_CHECK_TIMEOUT_MS = 10_000;
export const LINK_CHECK_CONCURRENCY = 5;

export type LinkCheckStatus = 'ok' | 'redirect' | 'broken' | 'timeout' | 'error';

export interface LinkCheckResult {
  status: LinkCheckStatus;
  httpStatus: number | null;
  error?: string;
}

export interface LinkCheckTarget {
  id: string;
  title: string;
  claim_url: string;
}

function classifyHttp(code: number): LinkCheckStatus {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 300 && code < 400) return 'redirect';
  return 'broken';
}

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const message = 'message' in err ? String(err.message) : '';
  return name === 'AbortError' || /timeout|aborted/i.test(message);
}

/**
 * HEAD the official URL, fall back to GET. 10 s timeout. Never follows into
 * a submission — this is a liveness probe only.
 */
export async function checkOfficialUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = LINK_CHECK_TIMEOUT_MS,
): Promise<LinkCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'error', httpStatus: null, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { status: 'error', httpStatus: null, error: 'invalid_url' };
  }

  const headers = { 'user-agent': LINK_CHECK_USER_AGENT, accept: '*/*' };

  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(parsed.toString(), {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        continue;
      }
      return { status: classifyHttp(res.status), httpStatus: res.status };
    } catch (err) {
      clearTimeout(timer);
      if (isTimeout(err)) {
        return { status: 'timeout', httpStatus: null, error: 'timeout' };
      }
      if (method === 'HEAD') continue;
      return { status: 'error', httpStatus: null, error: 'fetch_failed' };
    }
  }

  return { status: 'error', httpStatus: null, error: 'fetch_failed' };
}

export function isBrokenLink(result: Pick<LinkCheckResult, 'status'>): boolean {
  return result.status === 'broken' || result.status === 'timeout' || result.status === 'error';
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export async function runOfficialLinkCheck(opts: {
  fetchFn?: typeof fetch;
  notify?: boolean;
} = {}): Promise<{ checked: number; broken: number }> {
  if (!flags.linkCheck()) return { checked: 0, broken: 0 };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('lawsuits')
    .select('id, title, claim_url')
    .eq('review_status', 'published')
    .in('status', ['open', 'closing_soon'])
    .not('claim_url', 'is', null);

  if (error) {
    console.error('[link-check] list failed', { code: error.code });
    return { checked: 0, broken: 0 };
  }

  const targets = ((data ?? []) as LinkCheckTarget[]).filter((row) => Boolean(row.claim_url));
  const now = new Date().toISOString();
  let broken = 0;

  await mapPool(targets, LINK_CHECK_CONCURRENCY, async (row) => {
    const result = await checkOfficialUrl(row.claim_url, opts.fetchFn ?? fetch);
    if (isBrokenLink(result)) broken += 1;
    const { error: writeError } = await svc
      .from('lawsuits')
      .update({
        link_status: result.status,
        link_http_status: result.httpStatus,
        link_checked_at: now,
      })
      .eq('id', row.id);
    if (writeError) console.error('[link-check] write failed', { code: writeError.code });
  });

  if (opts.notify !== false && broken > 0) {
    await notifyAdmins({
      subject: `${broken} official claim link${broken === 1 ? '' : 's'} failed`,
      html: `<p>${broken} of ${targets.length} published official claim links did not return 2xx/3xx.</p><p>See /admin → Broken links.</p>`,
    });
  }

  return { checked: targets.length, broken };
}

export async function listBrokenOfficialLinks(limit = 100): Promise<
  Array<{
    id: string;
    title: string;
    slug: string;
    claim_url: string | null;
    link_status: string | null;
    link_http_status: number | null;
    link_checked_at: string | null;
  }>
> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('lawsuits')
      .select('id, title, slug, claim_url, link_status, link_http_status, link_checked_at')
      .in('link_status', ['broken', 'timeout', 'error'])
      .order('link_checked_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Array<{
      id: string;
      title: string;
      slug: string;
      claim_url: string | null;
      link_status: string | null;
      link_http_status: number | null;
      link_checked_at: string | null;
    }>;
  } catch {
    return [];
  }
}
