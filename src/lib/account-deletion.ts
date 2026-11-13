/**
 * Tables that hold a signed-in user's rows. Account deletion must cover every
 * one of these. The list is asserted against create-table statements in
 * supabase/migrations so a new user-owned table cannot ship uncovered.
 *
 * Tables that only reference auth.users for an admin actor (share_links.created_by,
 * verification_drafts.reviewed_by) are not listed: those FKs are ON DELETE SET NULL.
 */
export const USER_OWNED_TABLES = [
  'profiles',
  'claims',
  'matches',
  'recoveries',
  'notifications',
  'referrals',
  'claim_events',
  'proof_feedback',
  'claim_authorizations',
  'filing_jobs',
  'match_events',
  'match_feature_snapshots',
  'match_labels',
  'profile_facts',
  'consent',
  'claim_reminder_sends',
  'drip_email_sends',
  'payout_tracker_sends',
  'match_alert_sends',
  'beta_feedback',
] as const;

export type UserOwnedTable = (typeof USER_OWNED_TABLES)[number];

/**
 * Removed only by ON DELETE CASCADE when the auth user is deleted, never by an
 * explicit delete. Deleting the profile first would leave a signed-in user
 * with no profile row if deleteUser then failed, and the service role has no
 * DELETE on claim_events (0006_claim_states.sql).
 */
export const CASCADE_ONLY_TABLES = ['profiles', 'claim_events'] as const;

/**
 * What POST /api/account/delete deletes, in this order, before deleting the
 * auth user. filing_jobs goes before claim_authorizations because
 * filing_jobs.authorization_id is ON DELETE RESTRICT (0015_assisted_filing.sql).
 * referrals is keyed by referrer_id, every other table by user_id.
 * profile_facts, consent (0027, 0028), claim_reminder_sends (0030),
 * drip_email_sends (0031), payout_tracker_sends (0035), match_alert_sends
 * (0036) and beta_feedback (0033) also cascade from auth.users, but are
 * deleted here too, as every user-owned table except CASCADE_ONLY_TABLES is.
 */
export const EXPLICIT_DELETE_ORDER = [
  'filing_jobs',
  'claim_authorizations',
  'match_feature_snapshots',
  'match_events',
  'match_labels',
  'proof_feedback',
  'recoveries',
  'notifications',
  'referrals',
  'profile_facts',
  'consent',
  'claim_reminder_sends',
  'drip_email_sends',
  'payout_tracker_sends',
  'match_alert_sends',
  'beta_feedback',
  'matches',
  'claims',
] as const;

const CREATE_TABLE_RE =
  /create table if not exists public\.([a-z0-9_]+)/gi;

const USER_OWNED_HINT =
  /references auth\.users|references public\.profiles|user_id\s+uuid/i;

/**
 * Tables created in migrations that look user-owned (a user_id / auth.users
 * FK) minus known non-user tables (admin-created share links, etc.).
 */
export const DELETION_IGNORE_TABLES = [
  'share_links',
  'share_link_clicks',
  'account_deletion_audit',
  'jobs',
  'subscribers',
  'sources',
  'lawsuits',
  'administrators',
  'administrator_form_mappings',
  'eligibility_rule_drafts',
  'ingest_alerts',
  'admin_access_log',
  'verification_drafts',
] as const;

export function tablesCreatedInMigrations(sql: string): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(CREATE_TABLE_RE)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

export function userOwnedTablesFromMigrations(sql: string): string[] {
  const owned: string[] = [];
  const blocks = sql.split(/create table if not exists public\./i).slice(1);
  for (const block of blocks) {
    const name = block.match(/^([a-z0-9_]+)/i)?.[1];
    if (!name) continue;
    if ((DELETION_IGNORE_TABLES as readonly string[]).includes(name)) continue;
    if (USER_OWNED_HINT.test(block.slice(0, 2500))) owned.push(name);
  }
  return owned;
}

export function uncoveredUserOwnedTables(sql: string): string[] {
  const found = userOwnedTablesFromMigrations(sql);
  return found.filter((name) => !(USER_OWNED_TABLES as readonly string[]).includes(name));
}
