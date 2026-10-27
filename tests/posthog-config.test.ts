import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('PostHog App Router wiring', () => {
  it('reverse-proxies ingest through /ingest so ad blockers miss the host', async () => {
    const config = read('next.config.mjs');
    expect(config).toContain("source: '/ingest/static/:path*'");
    expect(config).toContain("source: '/ingest/:path*'");
    expect(config).toContain('skipTrailingSlashRedirect: true');
    expect(config).toMatch(/i\.posthog\.com/);
  });

  it('initializes with the first-party host, pageleave, and Do Not Track', () => {
    const src = read('src/components/PostHogProvider.tsx');
    expect(src).toContain("api_host: '/ingest'");
    expect(src).toContain('capture_pageleave: true');
    expect(src).toContain('capture_pageview: false');
    expect(src).toContain('$pageview');
    expect(src).toContain('doNotTrackEnabled');
    expect(src).toContain('setPersonProperties');
  });

  it('identifies with the account id only', () => {
    const auth = read('src/components/AuthForm.tsx');
    expect(auth).toContain('posthog?.identify(userId)');
    expect(auth).not.toMatch(/identify\([^)]*email/);
    expect(auth).toContain('signup_completed');
    expect(auth).toContain('attributionMetadata');
  });

  it('reuses existing funnel names and adds only the missing ones', () => {
    const flow = read('src/components/claims/ClaimFlow.tsx');
    const packet = read('src/components/claims/PrefillPacket.tsx');
    const home = read('src/app/page.tsx');
    const settlement = read('src/app/lawsuits/[slug]/page.tsx');
    const report = read('src/components/claims/ReportFiled.tsx');
    const admin = read('src/components/admin/ShareLinksManager.tsx');
    expect(flow).toContain("capture('match_viewed'");
    expect(flow).toContain("capture('official_form_opened')");
    expect(packet).toContain("capture('prefill_opened'");
    expect(packet).toContain("capture('prefill_completed'");
    expect(home).toContain('landing_viewed');
    expect(settlement).toContain('settlement_viewed');
    expect(report).toContain('claim_reported_filed');
    expect(admin).toContain("capture('share_link_created'");
  });
});
