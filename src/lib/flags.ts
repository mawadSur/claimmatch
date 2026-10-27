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
};
