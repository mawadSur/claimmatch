/**
 * PostHog ingest reverse-proxy targets. Ad blockers list us.i.posthog.com;
 * first-party /ingest rewrites keep events flowing.
 */

const DEFAULT_HOST = 'https://us.i.posthog.com';

export function posthogApiHost(raw = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST): string {
  const host = raw.replace(/\/$/, '');
  if (host.includes('.i.posthog.com')) return host;
  return host.replace('posthog.com', 'i.posthog.com');
}

export function posthogAssetHost(apiHost = posthogApiHost()): string {
  return apiHost.replace('.i.posthog.com', '-assets.i.posthog.com');
}

export function posthogUiHost(apiHost = posthogApiHost()): string {
  return apiHost.replace('.i.posthog.com', '.posthog.com');
}

export function posthogRewrites(host = process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST) {
  const api = posthogApiHost(host);
  const assets = posthogAssetHost(api);
  return [
    { source: '/ingest/static/:path*', destination: `${assets}/static/:path*` },
    { source: '/ingest/:path*', destination: `${api}/:path*` },
  ];
}
