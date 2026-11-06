import { gunzipSync } from 'node:zlib';
import type { Page, Request } from '@playwright/test';

export type CapturedEvent = {
  event: string;
  properties: Record<string, unknown>;
};

export type IngestHit = {
  method: string;
  url: string;
  body: string | null;
};

function inflateBodies(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return [trimmed];
  return trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
}

function asObjects(raw: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
    if (parsed && typeof parsed === 'object') {
      const batch = parsed as { batch?: unknown; event?: unknown };
      if (Array.isArray(batch.batch)) {
        return batch.batch.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
      }
      return [parsed as Record<string, unknown>];
    }
  } catch {
    /* text blobs still searched below */
  }
  return [];
}

export function eventsFromPostData(raw: string | null): CapturedEvent[] {
  const found: CapturedEvent[] = [];
  for (const body of inflateBodies(raw)) {
    for (const obj of asObjects(body)) {
      const event = typeof obj.event === 'string' ? obj.event : null;
      if (!event) continue;
      const properties =
        obj.properties && typeof obj.properties === 'object'
          ? (obj.properties as Record<string, unknown>)
          : {};
      found.push({ event, properties });
    }
  }
  if (found.length === 0 && raw) {
    const names = [
      'signup_started',
      'signup_submitted',
      'signup_completed',
      'profile_completed',
      'matches_viewed',
      'match_viewed',
      'official_form_opened',
      'claim_tracking_started',
      'claim_reported_filed',
      'landing_viewed',
    ];
    for (const name of names) {
      if (raw.includes(`"${name}"`)) found.push({ event: name, properties: {} });
    }
  }
  return found;
}

export function decodeRequestBody(req: Request): string | null {
  const text = req.postData();
  if (text) return text;
  const buf = req.postDataBuffer();
  if (!buf || buf.length === 0) return null;
  try {
    return gunzipSync(buf).toString('utf8');
  } catch {
    return buf.toString('utf8');
  }
}

/** Intercept first-party /ingest so nothing reaches PostHog. */
export async function interceptAnalytics(page: Page, sink: CapturedEvent[], hits?: IngestHit[]) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'doNotTrack', { get: () => '0', configurable: true });
      Object.defineProperty(navigator, 'msDoNotTrack', { get: () => '0', configurable: true });
      Object.defineProperty(window, 'doNotTrack', { get: () => '0', configurable: true });
    } catch {
      /* property may already be an accessor */
    }
    const persist = (row: { event: string; properties: Record<string, unknown> }) => {
      try {
        const prev = JSON.parse(sessionStorage.getItem('__cmEvents') || '[]') as unknown[];
        prev.push(row);
        sessionStorage.setItem('__cmEvents', JSON.stringify(prev));
      } catch {
        /* ignore quota */
      }
    };
    const wrap = () => {
      const ph = (window as Window & { posthog?: { capture?: (...args: unknown[]) => unknown; __cmWrapped?: boolean } }).posthog;
      if (!ph?.capture || ph.__cmWrapped) return;
      const orig = ph.capture.bind(ph);
      ph.capture = ((event: string, properties?: Record<string, unknown>, ...rest: unknown[]) => {
        persist({ event, properties: properties || {} });
        return orig(event, properties, ...rest);
      }) as typeof ph.capture;
      ph.__cmWrapped = true;
    };
    const id = window.setInterval(wrap, 20);
    window.setTimeout(() => window.clearInterval(id), 30_000);
    wrap();
  });
  await page.context().route(/\/ingest/, async (route) => {
    const req = route.request();
    const body = decodeRequestBody(req);
    const path = new URL(req.url()).pathname;
    hits?.push({ method: req.method(), url: req.url(), body: body ? body.slice(0, 4000) : null });
    if (req.method() === 'POST') {
      sink.push(...eventsFromPostData(body));
      if (body) {
        for (const m of body.matchAll(/"event"\s*:\s*"([^"]+)"/g)) {
          if (!sink.some((row) => row.event === m[1])) sink.push({ event: m[1], properties: {} });
        }
      }
    }
    // Remote config is JS; a JSON stub here prevents posthog-js from capturing.
    if (path.includes('/array/') && path.endsWith('.js')) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'void 0;' });
      return;
    }
    if (path.includes('/array/') || path.includes('/flags') || path.includes('/decide')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ flags: {}, featureFlags: {}, config: { enable_collect_everything: false } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
  });
}

/** Official administrator host is a reserved .test fixture, never submitted. */
export async function interceptOfficialForm(page: Page) {
  await page.context().route('https://isolated-admin.claimmatch.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><title>Isolated official form</title>
        <p>Fixture administrator page. Not a real claim form. Nothing was submitted.</p>`,
    });
  });
}

export function recordApi(requests: string[]) {
  return (req: Request) => {
    const url = req.url();
    if (url.includes('/api/claims') || url.includes('/auth/v1/') || url.includes('/rest/v1/')) {
      requests.push(`${req.method()} ${url}`);
    }
  };
}

export function hasEvent(
  events: CapturedEvent[],
  name: string,
  pred?: (props: Record<string, unknown>) => boolean,
) {
  return events.some((row) => row.event === name && (!pred || pred(row.properties)));
}
