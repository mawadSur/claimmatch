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
    expect(src).toContain('shouldCapturePageview');
    expect(src).toContain('TRAFFIC_PROPERTY');
    expect(src).toContain('disable_external_dependency_loading: true');
    expect(src).not.toContain('opt_out_capturing');
  });

  it('identifies with the account id only', () => {
    const auth = read('src/components/AuthForm.tsx');
    expect(auth).toContain('posthog?.identify(userId)');
    expect(auth).not.toMatch(/identify\([^)]*email/);
    expect(auth).toContain('signup_completed');
    expect(auth).toContain('signup_submitted');
    expect(auth).toContain('signup_error');
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
    expect(flow).toContain("capture('official_form_opened'");
    expect(read('src/components/settlement/OfficialFormLink.tsx')).toContain('ANALYTICS_EVENTS.official_form_opened');
    expect(read('src/components/settlement/SettlementEligibilityQuiz.tsx')).toContain('eligibility_quiz_started');
    expect(read('src/components/settlement/SettlementEligibilityQuiz.tsx')).toContain('eligibility_quiz_completed');
    expect(packet).toContain("capture('prefill_opened'");
    expect(packet).toContain("capture('prefill_completed'");
    expect(home).toContain('landing_viewed');
    expect(settlement).toContain('settlement_viewed');
    expect(report).toContain('claim_reported_filed');
    expect(report).toContain('claim_filed');
    expect(admin).toContain("capture('share_link_created'");
    expect(read('src/app/signup/page.tsx')).toContain('signup_started');
    expect(read('src/components/match-preview/MatchPreview.tsx')).toContain('match_preview_started');
    expect(read('src/components/match-preview/MatchPreview.tsx')).toContain('match_preview_completed');
    expect(read('src/components/analytics/SignupContextReturned.tsx')).toContain('signup_context_returned');
    expect(read('src/components/settlement/SettlementQualifyCta.tsx')).toContain('settlement_cta_clicked');
    expect(read('src/app/lawsuits/[slug]/page.tsx')).toContain('settlement_cta_viewed');
    expect(read('src/components/settlement/RelatedSettlementLink.tsx')).toContain('related_settlement_clicked');
    expect(read('src/components/analytics/CaptureOnce.tsx')).toContain('withFunnelAttribution');
    expect(read('src/components/OnboardingWizard.tsx')).toContain('profile_completed');
    expect(read('src/app/onboarding/page.tsx')).toContain('event="signup_completed"');
    expect(read('src/app/onboarding/page.tsx')).toContain("evidence: 'email_confirmed'");
    expect(read('src/app/dashboard/page.tsx')).toContain('matches_viewed');
    expect(read('src/app/dashboard/page.tsx')).toContain('claim_timeline_viewed');
    expect(read('src/app/dashboard/page.tsx')).toContain('match_reason_viewed');
    expect(read('src/app/scorecard/page.tsx')).toContain('scorecard_viewed');
    expect(read('src/components/claims/ReportFiled.tsx')).toContain('filingConfirmedProperties');
    expect(read('src/lib/analytics/events.ts')).toContain("evidence: 'user_reported_and_saved'");
    expect(read('src/lib/match-events-shared.ts')).toContain("return 'match_feedback'");
    expect(read('src/lib/match-events-shared.ts')).not.toContain("return 'match_filed'");
  });
});
