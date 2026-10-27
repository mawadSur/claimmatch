import { LAWSUITS_CACHE_CONTROL, SECURITY_HEADERS } from './src/lib/security-headers.mjs';

/** @type {import('next').NextConfig} */
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(
  /\/$/,
  '',
);
const POSTHOG_API = POSTHOG_HOST.includes('.i.posthog.com')
  ? POSTHOG_HOST
  : POSTHOG_HOST.replace('posthog.com', 'i.posthog.com');
const POSTHOG_ASSETS = POSTHOG_API.replace('.i.posthog.com', '-assets.i.posthog.com');

const nextConfig = {
  reactStrictMode: true,
  // PostHog /ingest/decide/?v=… must keep its trailing slash.
  skipTrailingSlashRedirect: true,
  images: {
    // Restrict the Next image optimizer to hosts we trust, so it can't be used
    // as an open image proxy / SSRF vector. Add specific CDN hosts as needed.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/settlements', destination: '/lawsuits', statusCode: 308 },
      // Hub pages stay on /settlements/* (category, closing-soon, new, recently-closed).
      {
        source: '/settlements/:slug((?!category|closing-soon|new|recently-closed)[^/]+)',
        destination: '/lawsuits/:slug',
        statusCode: 308,
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: '/ingest/:path*', destination: `${POSTHOG_API}/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: '/lawsuits',
        headers: [{ key: 'Cache-Control', value: LAWSUITS_CACHE_CONTROL }],
      },
    ];
  },
};

export default nextConfig;
