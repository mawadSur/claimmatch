/**
 * Tables that hold a signed-in user's rows. Account deletion must cover every
 * one of these. The list is asserted against create-table statements in
 * supabase/migrations so a new user-owned table cannot ship uncovered.
 *
 * Tables that only reference auth.users for an admin actor (share_links.created_by)
 * are not listed: that FK is ON DELETE SET NULL.
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
] as const;

export type UserOwnedTable = (typeof USER_OWNED_TABLES)[number];

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
