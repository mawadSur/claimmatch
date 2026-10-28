// Server-side switches. Each defaults to the safe Phase 0 behavior and turns on
// only when its env var is exactly "1". Vercel applies env changes on the next
// deploy, so no code change is needed to flip one.

function on(name: string): boolean {
  return process.env[name] === '1';
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
   * Stage 2: authorized assisted filing. Off: no e-sign, queue, worker or
   * filing UI. Even when on, a settlement must also have
   * assisted_filing_allowed = true.
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
};
