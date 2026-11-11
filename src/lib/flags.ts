// Server-side switches. Each defaults to the safe Phase 0 behavior and turns on
// only when its env var is exactly "1". Vercel applies env changes on the next
// deploy, so no code change is needed to flip one.

/**
 * The flags the native app may see (GET /api/mobile/config). The app has no
 * server env, so without these values every flag would read as off there.
 */
export const CLIENT_FLAG_NAMES = [
  'VERIFIED_FIELDS_ENABLED',
  'CLOSES_IN_CHIPS_ENABLED',
  'CALENDAR_ICS_ENABLED',
  'FORM_FIELD_ORDER_ENABLED',
  'PROOF_FEEDBACK_ENABLED',
  'ASSISTED_FILING_ENABLED',
  'PAYOUT_REPORT_ENABLED',
  'MATCH_METRICS_ENABLED',
  'FEE_DISCLOSURE_ENABLED',
  'CATALOG_HIDE_UNKNOWNS_ENABLED',
] as const;
export type ClientFlagName = (typeof CLIENT_FLAG_NAMES)[number];

let overrides: Partial<Record<ClientFlagName, boolean>> | null = null;

/**
 * Native app only: the values from GET /api/mobile/config. Never call this on
 * the server, where one request would change the flags of every other: the
 * Next server ignores overrides, and tests/flags-client.test.ts fails on any
 * use under src/. Names outside CLIENT_FLAG_NAMES are dropped, so a config
 * response can never turn on a server-only flag in the app.
 */
export function setFlagOverrides(next: Partial<Record<ClientFlagName, boolean>> | null): void {
  if (!next) {
    overrides = null;
    return;
  }
  const given = CLIENT_FLAG_NAMES.filter((name) => Object.prototype.hasOwnProperty.call(next, name));
  overrides = Object.fromEntries(given.map((name) => [name, next[name] === true]));
}

function on(name: string): boolean {
  // NEXT_RUNTIME is 'nodejs' or 'edge' only on the Next server; it is empty in
  // the browser bundle and unset in the native app.
  if (overrides && !process.env.NEXT_RUNTIME && Object.prototype.hasOwnProperty.call(overrides, name)) {
    return overrides[name as ClientFlagName] === true;
  }
  return process.env[name] === '1';
}

/** The server's values for the app: env only, never the app's overrides. */
export function clientFlagValues(): Record<ClientFlagName, boolean> {
  const values = CLIENT_FLAG_NAMES.map((name) => [name, process.env[name] === '1'] as const);
  return Object.fromEntries(values) as Record<ClientFlagName, boolean>;
}

export const flags = {
  /** D50: the daily state-only match email. Off until the Phase 1 engine ships. */
  matchEmails: () => on('MATCH_EMAILS_ENABLED'),
  /** D50: the Monday digest. Off until the Phase 1 engine ships. */
  digest: () => on('DIGEST_ENABLED'),
  /** Admin money actions on legacy recovery rows (record received, mark paid). */
  adminRecoveries: () => on('ADMIN_RECOVERIES_ENABLED'),
  /** The fictional sample adapter. Never runs in production, even if set. */
  sampleSource: () => on('ENABLE_SAMPLE_SOURCE') && process.env.NODE_ENV !== 'production',
  /**
   * C7: public "Verified on {date}" badge and preferring verified who-qualifies
   * / proof over feed text. Off until "verified" is defined (checklist B9).
   */
  verifiedFields: () => on('VERIFIED_FIELDS_ENABLED'),
  /** C9: add-to-calendar .ics on settlement pages that have a deadline. */
  calendarIcs: () => on('CALENDAR_ICS_ENABLED'),
  /** C11: "Closes in N days" chips on cards and detail pages. Real dates only. */
  closesInChips: () => on('CLOSES_IN_CHIPS_ENABLED'),
  /**
   * C13: per-settlement Open Graph share card (title + deadline if any).
   * Off: the slug OG image falls back to the site-wide card.
   */
  settlementOg: () => on('SETTLEMENT_OG_ENABLED'),
  /** C8: /check notice lookup (name, administrator, or claim/notice ID). */
  noticeLookup: () => on('NOTICE_LOOKUP_ENABLED'),
  /** C10: list copy-ready packet fields in a settlement's official-form order. */
  formFieldOrder: () => on('FORM_FIELD_ORDER_ENABLED'),
  /**
   * C12: signed-in "Did the official site ask for proof?" feedback.
   * Stored as an unverified crowd signal; never shown as fact.
   */
  proofFeedback: () => on('PROOF_FEEDBACK_ENABLED'),
  /** C14: /settlements/recently-closed archive (noindex). */
  closedArchive: () => on('CLOSED_ARCHIVE_ENABLED'),
  /**
   * C15: weekly closing-soon email. Never sends unless this is exactly "1",
   * and still refuses without a postal address and a verified sender.
   */
  closingSoonEmail: () => on('CLOSING_SOON_EMAIL_ENABLED'),
  /**
   * C17: home-page "Data breach & privacy" and "No proof required" entry points.
   * No match language.
   */
  homeNarrowing: () => on('HOME_NARROWING_ENABLED'),
  /**
   * C16 / E3: settlement-specific eligibility questions and any "you qualify"
   * verdict. Off until counsel and security review (B4). The onboarding
   * questionnaire in eligibility.ts is unrelated and stays as-is.
   */
  eligibilityQuestions: () => on('ELIGIBILITY_QUESTIONS_ENABLED'),
  /**
   * C16 / E4: official-form autofill extension or bookmarklet. Off until
   * counsel and security review (B4). C10 form-field order is copy-ready
   * packet order only — not this.
   */
  formAutofill: () => on('FORM_AUTOFILL_ENABLED'),
  /**
   * C16 / E7: embeddable partner widget. Off until partner discovery calls.
   */
  partnerWidget: () => on('PARTNER_WIDGET_ENABLED'),
  /**
   * Match settlements that have no structured rules (no states / requires /
   * anyOf) via category and keyword overlap with the profile. Off: those rows
   * stay at 0.35 and drop below matchProfile's 0.4 threshold.
   */
  unstructuredMatch: () => on('MATCH_UNSTRUCTURED_ENABLED'),
  /**
   * Cap a state-only hit so it is not scored as a strong (1.0) match. Off:
   * a listed-state row with no other criteria still scores 1.0.
   */
  stateOnlyCap: () => on('MATCH_STATE_ONLY_CAP_ENABLED'),
  /**
   * Full-service filing is the primary path. Off: no e-sign, queue, worker
   * or filing CTA. On: match CTAs offer “we’ll file it for you”, then
   * per-claim authorization and the filing queue.
   */
  assistedFiling: () => on('ASSISTED_FILING_ENABLED'),
  /**
   * Stage 3: administrator API adapters and bulk export of authorized claims.
   * Off: the registry is readable but no adapter or export runs.
   */
  directFiling: () => on('DIRECT_FILING_ENABLED'),
  /**
   * Structured match events, feature snapshots, labels, and related PostHog
   * events. Off: nothing is written to match_events / match_labels.
   */
  matchMetrics: () => on('MATCH_METRICS_ENABLED'),
  /**
   * Eligibility-rule draft script and the admin approve UI. Off: no drafts
   * are written or published. Drafts never auto-apply to lawsuits.eligibility.
   */
  eligibilityDrafts: () => on('ELIGIBILITY_DRAFTS_ENABLED'),
  /**
   * Email admins via Resend when the nightly ingest fails or updates 0 rows.
   * Alert rows are still recorded either way. Off: no email.
   */
  ingestAlertEmails: () => on('INGEST_ALERT_EMAILS_ENABLED'),
  /**
   * Weekly official claim-link checker. Off: the cron route no-ops and the
   * daily Monday hook does not probe URLs.
   */
  linkCheck: () => on('LINK_CHECK_ENABLED'),
  /**
   * User-reported "I got paid" amount (no fee shown or charged). Off: the
   * form and API are hidden.
   */
  payoutReport: () => on('PAYOUT_REPORT_ENABLED'),
  /**
   * Public 15-percent-of-recovery fee on every ClaimMatch claim. Off: the
   * site keeps saying it is free during beta (counsel review still open).
   */
  feeDisclosure: () => on('FEE_DISCLOSURE_ENABLED'),
  /**
   * After N consecutive successful-feed misses, queue the open SettleSignal
   * row on /admin for a person to close or keep. Never auto-closes. Off: the
   * ingest still increments missed_feed_count and may auto-close after N
   * (existing behavior).
   */
  missingCloseQueue: () => on('INGEST_MISSING_CLOSE_QUEUE_ENABLED'),
  /**
   * Server-side /lawsuits pagination (24 per page) plus rel=next/prev.
   * Off: the catalog still renders every open row on one page.
   */
  lawsuitsPagination: () => on('LAWSUITS_PAGINATION_ENABLED'),
  /**
   * Admin review queue for closures the ingest circuit breaker held.
   * Off: /admin does not list them as an action queue and the apply
   * route refuses writes. Never auto-closes.
   */
  adminHeldClosures: () => on('ADMIN_HELD_CLOSURES_ENABLED'),
  /**
   * When the only ingest problem is held closures (writes otherwise
   * succeeded), store the jobs row as a warning and answer 200.
   * Off: held closures still fail the cron (500), as before.
   */
  ingestHeldIsWarning: () => on('INGEST_HELD_IS_WARNING'),
  /**
   * Home-page "Data breach & privacy" and "No proof required" cards.
   * Off: those cards stay hidden. HOME_NARROWING_ENABLED is the older
   * name for the same cards; either flag shows them.
   */
  homeWedgeEntries: () => on('HOME_WEDGE_ENTRIES_ENABLED'),
  /**
   * Home hero primary CTA goes to /signup instead of /lawsuits.
   * Off (default): "See open settlements" keeps the current browse path.
   */
  homeAccountFirstCta: () => on('HOME_ACCOUNT_FIRST_CTA_ENABLED'),
  /**
   * Logged-out "See matching settlements" preview on home and /lawsuits.
   * Off: no preview entry, /preview 404s, and /api/match-preview 404s.
   */
  matchPreview: () => on('MATCH_PREVIEW_ENABLED'),
  /**
   * Claim CTAs send signed-out visitors through /signup with a safe return
   * path so confirm-email → onboarding lands them back on that claim.
   * Off: signed-out /claim visits still go to /login.
   */
  signupContext: () => on('SIGNUP_CONTEXT_ENABLED'),
  /**
   * Settlement-page "Check if you qualify" starts a match preview scoped to
   * that open listing, then signup with the settlement as return context.
   * Off: the existing CTAs still go to /claim/{slug}. Closed listings never
   * show it.
   */
  settlementPageCta: () => on('SETTLEMENT_PAGE_CTA_ENABLED'),
  /**
   * Short, server-rendered list of other open published settlements on each
   * settlement page (same category, then nearest deadlines). Off: hidden.
   */
  relatedSettlements: () => on('RELATED_SETTLEMENTS_ENABLED'),
  /**
   * After the nightly ingest, and on admin publish/close, submit changed
   * public URLs to IndexNow. Off: no request. Never runs in tests, even if set.
   */
  indexNow: () => on('INDEXNOW_ENABLED'),
  /**
   * Public /llms.txt (llmstxt.org). Off: that path 404s. Cached/ISR when on.
   */
  llmsTxt: () => on('LLMS_TXT_ENABLED'),
  /**
   * Classify first-touch referrer / utm_source into a closed traffic channel,
   * attach it to PostHog events, persist it on the profile, and show an admin
   * card. Off: no new property, no extra RPC, no admin card.
   */
  aiReferrerAttribution: () => on('AI_REFERRER_ATTRIBUTION_ENABLED'),
  /**
   * Richer profile: profile_facts collection, onboarding v2 step, /settings/profile,
   * and /admin/users. Off: those surfaces 404 or stay hidden.
   */
  profileV2: () => on('PROFILE_V2_ENABLED'),
  /**
   * Persist matcher results into public.matches after nightly ingest.
   * Off: the dashboard live-computes; the store job is skipped.
   * Separate from MATCH_EMAILS_ENABLED.
   */
  matchStore: () => on('MATCH_STORE_ENABLED'),
  /**
   * Group the held-closure queue by a suggested decision (deadline / official
   * site) and allow "approve all in this group". Official-site checks run from
   * cron only. Never auto-closes. Off: the flat queue stays as it is.
   */
  heldClosureTriage: () => on('HELD_CLOSURE_TRIAGE_ENABLED'),
  /**
   * Nightly ingest may close a held row whose *stored* deadline is already
   * past, and writes that to held_closure_decisions. Off: those rows stay
   * in the review queue. Never closes a row with no stored deadline.
   */
  heldAutoClosePastDeadline: () => on('HELD_AUTO_CLOSE_PAST_DEADLINE'),
  /**
   * Email opted-in users 7 days and 1 day before a tracked, unfiled claim
   * deadline. Off: the daily cron skips the step. Idempotent; never sends
   * without email_opt_in.
   */
  deadlineReminders: () => on('DEADLINE_REMINDERS_ENABLED'),
  /**
   * Incomplete-onboarding (+24h) and "did you file?" (+3 days after official-
   * form intent) drips. Off: the daily cron skips the step. Idempotent; never
   * sends without email_opt_in, a postal address, and a verified sender.
   */
  onboardingDrip: () => on('ONBOARDING_DRIP_ENABLED'),
  /**
   * Dashboard card: unanswered matcher questions vs how many additional open
   * catalog settlements those answers could unlock. Off: hidden.
   */
  profileCompleteness: () => on('PROFILE_COMPLETENESS_ENABLED'),
  /**
   * Public /invite landing for the soft-invite cohort. Off: that path 404s.
   */
  softInviteLanding: () => on('SOFT_INVITE_LANDING_ENABLED'),
  /**
   * Panel-objection copy: browse/official-form need no account, what we store,
   * hide unknown payout/proof, and the neutral beta pricing line. Off: current
   * live copy stays. Counsel should review the pricing line before flipping.
   */
  panelTrustCopy: () => on('PANEL_TRUST_COPY_ENABLED'),
  /**
   * Catalog order: no-proof, then higher listed payout, then sooner deadline.
   * Off: known deadlines first (current behavior). Never invents payouts.
   */
  catalogValueRank: () => on('CATALOG_VALUE_RANK_ENABLED'),
  /**
   * Signed-out per-settlement checklist from stored eligibility text only.
   * Off: hidden. Never a "you qualify" verdict.
   */
  settlementQuiz: () => on('SETTLEMENT_QUIZ_ENABLED'),
  /**
   * Per-tester / per-community invite codes on the SoftLaunch admin card.
   * Off: no create UI, visit logging, or beta_code_visit. Reuses share_links
   * + first_ref. `/invite?code=` still maps to signup `ref` so a leftover
   * link keeps first-touch if the invite landing is on.
   */
  betaInviteCodes: () => on('BETA_INVITE_CODES_ENABLED'),
  /**
   * Signed-in dashboard prompt for short beta feedback and an interview
   * opt-in. Off: hidden, and /api/beta-feedback 404s. Never sends email.
   */
  betaFeedback: () => on('BETA_FEEDBACK_ENABLED'),
  /**
   * Catalog cards and listings omit unknown proof / payout / deadline rows
   * instead of printing "Unknown" or "Not stated", and Settings stops
   * collecting a phone number. Off: current live cards and the phone field
   * stay. Does not delete stored phone values.
   */
  catalogHideUnknowns: () => on('CATALOG_HIDE_UNKNOWNS_ENABLED'),
  /**
   * After-you-file timeline on submitted claims (dashboard + claim page).
   * Hearing date and payment timing only from the settlement record.
   */
  claimTimeline: () => on('CLAIM_TIMELINE_ENABLED'),
  /**
   * Email opted-in users who reported filing when a listed hearing date
   * passes or admin enters payment timing. Off: the daily cron skips the
   * step. Idempotent; never sends without email_opt_in.
   */
  payoutTrackerEmails: () => on('PAYOUT_TRACKER_EMAILS_ENABLED'),
  /**
   * One "Why this matches you" line on match cards, from matcher reasons.
   * Off: the existing reason bullets stay as they are.
   */
  matchReason: () => on('MATCH_REASON_ENABLED'),
  /**
   * Public /scorecard of measured counts. Off: that path 404s and is left
   * out of the sitemap.
   */
  trustScorecard: () => on('TRUST_SCORECARD_ENABLED'),
};
