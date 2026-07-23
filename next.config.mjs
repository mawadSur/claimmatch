import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Restrict the Next image optimizer to hosts we trust, so it can't be used
    // as an open image proxy / SSRF vector. Add specific CDN hosts as needed.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

// Wrap with Sentry. Runtime reporting is gated by SENTRY_DSN in the
// instrumentation files, so this is inert without a DSN. Source-map upload only
// runs when SENTRY_AUTH_TOKEN (+ org/project) are set — otherwise the build
// still succeeds, just without symbolication. Safe for local/sample/CI builds.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only chatter in CI; stay quiet locally.
  silent: !process.env.CI,
  // Upload a wider set of client bundles for readable stack traces.
  widenClientFileUpload: true,
  // Strip the Sentry SDK logger from client bundles to save bytes.
  disableLogger: true,
});
