/**
 * Response headers applied in next.config.mjs. CSP is Report-Only so a
 * mismatch cannot break the site. Promote Content-Security-Policy-Report-Only
 * to Content-Security-Policy after a week of clean reports.
 *
 * Allows: self, the PostHog /ingest rewrite (same-origin), Supabase,
 * Vercel Analytics, and inline styles Next.js needs.
 */

export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY_REPORT_ONLY },
];

/** Public catalog list: no per-user content, safe to CDN-cache. */
export const LAWSUITS_CACHE_CONTROL = 'public, s-maxage=900, stale-while-revalidate=86400';
