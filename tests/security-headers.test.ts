import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('security headers', () => {
  it('exports nosniff, frame denial, referrer policy, permissions, and CSP report-only', () => {
    const src = read('src/lib/security-headers.mjs');
    expect(src).toContain("key: 'X-Content-Type-Options'");
    expect(src).toContain("value: 'nosniff'");
    expect(src).toContain("key: 'X-Frame-Options'");
    expect(src).toContain("value: 'DENY'");
    expect(src).toContain("key: 'Referrer-Policy'");
    expect(src).toContain("value: 'strict-origin-when-cross-origin'");
    expect(src).toContain("key: 'Permissions-Policy'");
    expect(src).toContain("key: 'Content-Security-Policy-Report-Only'");
    expect(src).toContain("default-src 'self'");
    expect(src).toContain('frame-ancestors');
    expect(src).toContain('https://*.supabase.co');
    expect(src).toContain('va.vercel-scripts.com');
    expect(src).toContain('s-maxage=900');
  });

  it('is wired through next.config headers()', () => {
    const config = read('next.config.mjs');
    expect(config).toContain('SECURITY_HEADERS');
    expect(config).toContain('LAWSUITS_CACHE_CONTROL');
    expect(config).toContain("source: '/:path*'");
    expect(config).toContain("source: '/lawsuits'");
  });
});
