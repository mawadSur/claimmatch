/**
 * Read-only catalog of every feature-flag env var `src/lib/flags.ts` reads.
 * Used by /admin/flags. Values are booleans only — never secret strings.
 */

import { flags } from '@/lib/flags';

export interface FlagDefinition {
  env: string;
  description: string;
  read: () => boolean;
}

export interface FlagStatus {
  env: string;
  description: string;
  enabled: boolean;
}

export const FLAG_CATALOG: readonly FlagDefinition[] = [
  { env: 'MATCH_EMAILS_ENABLED', description: 'Daily state-only match email.', read: () => flags.matchEmails() },
  { env: 'DIGEST_ENABLED', description: 'Monday digest email.', read: () => flags.digest() },
  {
    env: 'ADMIN_RECOVERIES_ENABLED',
    description: 'Admin money actions on legacy recovery rows.',
    read: () => flags.adminRecoveries(),
  },
  {
    env: 'ENABLE_SAMPLE_SOURCE',
    description: 'Fictional sample adapter. Never runs in production, even if set.',
    read: () => flags.sampleSource(),
  },
  {
    env: 'VERIFIED_FIELDS_ENABLED',
    description: 'Public verified-on-date badge and verified who-qualifies / proof.',
    read: () => flags.verifiedFields(),
  },
  { env: 'CALENDAR_ICS_ENABLED', description: 'Add-to-calendar .ics on settlements with a deadline.', read: () => flags.calendarIcs() },
  { env: 'CLOSES_IN_CHIPS_ENABLED', description: 'Closes-in-N-days chips on cards and detail pages.', read: () => flags.closesInChips() },
  { env: 'SETTLEMENT_OG_ENABLED', description: 'Per-settlement Open Graph share card.', read: () => flags.settlementOg() },
  { env: 'NOTICE_LOOKUP_ENABLED', description: '/check notice lookup by name, administrator, or ID.', read: () => flags.noticeLookup() },
  {
    env: 'FORM_FIELD_ORDER_ENABLED',
    description: 'List copy-ready packet fields in official-form order.',
    read: () => flags.formFieldOrder(),
  },
  {
    env: 'PROOF_FEEDBACK_ENABLED',
    description: 'Signed-in “did the official site ask for proof?” feedback.',
    read: () => flags.proofFeedback(),
  },
  { env: 'CLOSED_ARCHIVE_ENABLED', description: '/settlements/recently-closed archive (noindex).', read: () => flags.closedArchive() },
  {
    env: 'CLOSING_SOON_EMAIL_ENABLED',
    description: 'Weekly closing-soon email. Still needs a postal address and verified sender.',
    read: () => flags.closingSoonEmail(),
  },
  {
    env: 'HOME_NARROWING_ENABLED',
    description: 'Home-page data-breach and no-proof entry points (older name).',
    read: () => flags.homeNarrowing(),
  },
  {
    env: 'ELIGIBILITY_QUESTIONS_ENABLED',
    description: 'Settlement-specific eligibility questions and any qualify verdict.',
    read: () => flags.eligibilityQuestions(),
  },
  {
    env: 'FORM_AUTOFILL_ENABLED',
    description: 'Official-form autofill extension or bookmarklet.',
    read: () => flags.formAutofill(),
  },
  { env: 'PARTNER_WIDGET_ENABLED', description: 'Embeddable partner widget.', read: () => flags.partnerWidget() },
  {
    env: 'MATCH_UNSTRUCTURED_ENABLED',
    description: 'Match listings with no structured rules via category and keyword overlap.',
    read: () => flags.unstructuredMatch(),
  },
  {
    env: 'MATCH_STATE_ONLY_CAP_ENABLED',
    description: 'Cap a state-only hit so it is not scored as a strong match.',
    read: () => flags.stateOnlyCap(),
  },
  {
    env: 'ASSISTED_FILING_ENABLED',
    description: 'Full-service filing as the primary path (e-sign, queue, worker).',
    read: () => flags.assistedFiling(),
  },
  {
    env: 'DIRECT_FILING_ENABLED',
    description: 'Administrator API adapters and bulk export of authorized claims.',
    read: () => flags.directFiling(),
  },
  {
    env: 'MATCH_METRICS_ENABLED',
    description: 'Structured match events, snapshots, labels, and related PostHog events.',
    read: () => flags.matchMetrics(),
  },
  {
    env: 'ELIGIBILITY_DRAFTS_ENABLED',
    description: 'Eligibility-rule draft script and the admin approve UI.',
    read: () => flags.eligibilityDrafts(),
  },
  {
    env: 'INGEST_ALERT_EMAILS_ENABLED',
    description: 'Email admins when the nightly ingest fails or updates 0 rows.',
    read: () => flags.ingestAlertEmails(),
  },
  { env: 'LINK_CHECK_ENABLED', description: 'Weekly official claim-link checker.', read: () => flags.linkCheck() },
  {
    env: 'PAYOUT_REPORT_ENABLED',
    description: 'User-reported “I got paid” amount (no fee shown or charged).',
    read: () => flags.payoutReport(),
  },
  {
    env: 'FEE_DISCLOSURE_ENABLED',
    description: 'Public recovery-share fee on every ClaimMatch claim.',
    read: () => flags.feeDisclosure(),
  },
  {
    env: 'INGEST_MISSING_CLOSE_QUEUE_ENABLED',
    description: 'Queue open feed misses on /admin instead of auto-closing.',
    read: () => flags.missingCloseQueue(),
  },
  {
    env: 'LAWSUITS_PAGINATION_ENABLED',
    description: 'Server-side /lawsuits pagination plus rel=next/prev.',
    read: () => flags.lawsuitsPagination(),
  },
  {
    env: 'ADMIN_HELD_CLOSURES_ENABLED',
    description: 'Admin review queue for closures the ingest circuit breaker held.',
    read: () => flags.adminHeldClosures(),
  },
  {
    env: 'INGEST_HELD_IS_WARNING',
    description: 'Treat ingest runs whose only problem is held closures as a warning (200).',
    read: () => flags.ingestHeldIsWarning(),
  },
  {
    env: 'HOME_WEDGE_ENTRIES_ENABLED',
    description: 'Home-page data-breach and no-proof cards.',
    read: () => flags.homeWedgeEntries(),
  },
  {
    env: 'HOME_ACCOUNT_FIRST_CTA_ENABLED',
    description: 'Home hero primary CTA goes to /signup instead of /lawsuits.',
    read: () => flags.homeAccountFirstCta(),
  },
  {
    env: 'MATCH_PREVIEW_ENABLED',
    description: 'Logged-out matching-settlements preview on home and /lawsuits.',
    read: () => flags.matchPreview(),
  },
  {
    env: 'SIGNUP_CONTEXT_ENABLED',
    description: 'Signed-out claim CTAs go through /signup with a safe return path.',
    read: () => flags.signupContext(),
  },
  {
    env: 'SETTLEMENT_PAGE_CTA_ENABLED',
    description: 'Settlement-page qualify CTA starts a match preview, then signup.',
    read: () => flags.settlementPageCta(),
  },
  {
    env: 'RELATED_SETTLEMENTS_ENABLED',
    description: 'Other open published settlements on each settlement page.',
    read: () => flags.relatedSettlements(),
  },
  {
    env: 'INDEXNOW_ENABLED',
    description: 'Ping IndexNow when public settlement URLs are published, updated, or closed.',
    read: () => flags.indexNow(),
  },
  {
    env: 'PROFILE_V2_ENABLED',
    description: 'Richer profile: facts, onboarding v2, /settings/profile, /admin/users.',
    read: () => flags.profileV2(),
  },
  {
    env: 'MATCH_STORE_ENABLED',
    description: 'Persist matcher results into public.matches after nightly ingest.',
    read: () => flags.matchStore(),
  },
  {
    env: 'HELD_CLOSURE_TRIAGE_ENABLED',
    description: 'Group the held-closure queue by a suggested decision; never auto-closes.',
    read: () => flags.heldClosureTriage(),
  },
  {
    env: 'HELD_AUTO_CLOSE_PAST_DEADLINE',
    description: 'Nightly ingest may close a held row whose stored deadline is already past.',
    read: () => flags.heldAutoClosePastDeadline(),
  },
  {
    env: 'DEADLINE_REMINDERS_ENABLED',
    description: 'Email opted-in users 7 days and 1 day before a tracked unfiled deadline.',
    read: () => flags.deadlineReminders(),
  },
  {
    env: 'ONBOARDING_DRIP_ENABLED',
    description: 'Incomplete-onboarding and did-you-file drip emails.',
    read: () => flags.onboardingDrip(),
  },
  {
    env: 'PROFILE_COMPLETENESS_ENABLED',
    description: 'Dashboard card: unanswered matcher questions vs unlockable listings.',
    read: () => flags.profileCompleteness(),
  },
  { env: 'SOFT_INVITE_LANDING_ENABLED', description: 'Public /invite landing for the soft-invite cohort.', read: () => flags.softInviteLanding() },
  {
    env: 'PANEL_TRUST_COPY_ENABLED',
    description: 'Panel-objection copy: browse without an account, what we store, beta pricing line.',
    read: () => flags.panelTrustCopy(),
  },
  {
    env: 'CATALOG_VALUE_RANK_ENABLED',
    description: 'Catalog order: no-proof, then higher listed payout, then sooner deadline.',
    read: () => flags.catalogValueRank(),
  },
  {
    env: 'SETTLEMENT_QUIZ_ENABLED',
    description: 'Signed-out per-settlement checklist from stored eligibility text only.',
    read: () => flags.settlementQuiz(),
  },
  {
    env: 'BETA_INVITE_CODES_ENABLED',
    description: 'Per-tester / per-community invite codes on the SoftLaunch admin card.',
    read: () => flags.betaInviteCodes(),
  },
  {
    env: 'BETA_FEEDBACK_ENABLED',
    description: 'Signed-in dashboard prompt for short beta feedback and an interview opt-in.',
    read: () => flags.betaFeedback(),
  },
  {
    env: 'CATALOG_HIDE_UNKNOWNS_ENABLED',
    description: 'Omit unknown proof / payout / deadline on catalog cards; stop collecting phone.',
    read: () => flags.catalogHideUnknowns(),
  },
  {
    env: 'LLMS_TXT_ENABLED',
    description: 'Public /llms.txt summary for AI tools. Off returns 404.',
    read: () => flags.llmsTxt(),
  },
  {
    env: 'AI_REFERRER_ATTRIBUTION_ENABLED',
    description: 'Classify ChatGPT / Perplexity / Bing / Gemini / Google first-touch and show an admin card.',
    read: () => flags.aiReferrerAttribution(),
  },
];

export function listFlagStatus(): FlagStatus[] {
  return FLAG_CATALOG.map((flag) => ({
    env: flag.env,
    description: flag.description,
    enabled: flag.read(),
  }));
}
