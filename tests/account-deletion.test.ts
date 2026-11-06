import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASCADE_ONLY_TABLES,
  EXPLICIT_DELETE_ORDER,
  USER_OWNED_TABLES,
  uncoveredUserOwnedTables,
} from '@/lib/account-deletion';

function allMigrationsSql(): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

describe('self-serve account deletion coverage', () => {
  it('lists every user-owned table created in migrations', () => {
    const missing = uncoveredUserOwnedTables(allMigrationsSql());
    expect(missing).toEqual([]);
    expect(USER_OWNED_TABLES).toContain('profiles');
    expect(USER_OWNED_TABLES).toContain('claims');
    expect(USER_OWNED_TABLES).toContain('recoveries');
    expect(USER_OWNED_TABLES).toContain('match_events');
    expect(USER_OWNED_TABLES).toContain('profile_facts');
    expect(USER_OWNED_TABLES).toContain('consent');
    expect(USER_OWNED_TABLES).toContain('matches');
    expect(USER_OWNED_TABLES).toContain('claim_reminder_sends');
    expect(USER_OWNED_TABLES).toContain('drip_email_sends');
  });

  it('removes every user-owned table exactly once: explicitly, or by cascade from the auth user', () => {
    const explicit: string[] = [...EXPLICIT_DELETE_ORDER];
    const cascade: string[] = [...CASCADE_ONLY_TABLES];
    expect([...explicit, ...cascade].sort()).toEqual([...USER_OWNED_TABLES].sort());
    expect(explicit.filter((table) => cascade.includes(table))).toEqual([]);
    expect(new Set(explicit).size).toBe(explicit.length);
    expect(cascade).toEqual(expect.arrayContaining(['profiles', 'claim_events']));
  });

  it('leaves only rows the migrations cascade from auth.users, and nothing later changes those keys', () => {
    // The route never deletes these; auth.admin.deleteUser takes them. Without
    // the cascade they would outlive the account (or block the delete).
    const sql = allMigrationsSql().replace(/--[^\n]*/g, '');
    const owner: Record<(typeof CASCADE_ONLY_TABLES)[number], string> = { profiles: 'id', claim_events: 'user_id' };
    for (const table of CASCADE_ONLY_TABLES) {
      const column = owner[table];
      const start = sql.search(new RegExp(`create table if not exists public\\.${table}\\s*\\(`, 'i'));
      expect(start, `create table public.${table}`).toBeGreaterThanOrEqual(0);
      const block = sql.slice(start, sql.indexOf('\n);', start));
      expect(block, table).toMatch(
        new RegExp(`\\n\\s*${column}\\s+uuid\\b[^,\\n]*references\\s+auth\\.users\\s*\\(id\\)\\s+on\\s+delete\\s+cascade`, 'i'),
      );

      const alters = sql.match(new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?public\\.${table}\\b[^;]*;`, 'gi')) ?? [];
      // Any dropped constraint could be the key; an added one only when it is a
      // key (0028's email_frequency CHECK on profiles is not).
      const keyChanges = alters.filter((stmt) =>
        new RegExp(
          `\\bdrop\\s+constraint\\b|\\badd\\s+constraint\\b[^;]*\\b(?:primary\\s+key|foreign\\s+key|references)\\b|\\b(?:alter|drop)\\s+column\\s+(?:if\\s+exists\\s+)?${column}\\b`,
          'i',
        ).test(stmt),
      );
      expect(keyChanges, table).toEqual([]);
    }
  });

  it('deletes filing jobs before the authorizations they RESTRICT', () => {
    const order: string[] = [...EXPLICIT_DELETE_ORDER];
    const jobs = order.indexOf('filing_jobs');
    expect(jobs).toBeGreaterThanOrEqual(0);
    expect(jobs).toBeLessThan(order.indexOf('claim_authorizations'));
  });

  it('exposes the delete control on settings', () => {
    const settings = readFileSync(join(process.cwd(), 'src/app/settings/page.tsx'), 'utf8');
    expect(settings).toContain('DeleteAccount');
    expect(settings).toContain('DownloadMyData');
    const button = readFileSync(join(process.cwd(), 'src/components/DeleteAccount.tsx'), 'utf8');
    expect(button).toContain('Delete my account and data');
    expect(button).toContain('DELETE');
  });
});
