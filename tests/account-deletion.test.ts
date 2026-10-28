import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
  });

  it('exposes the delete control on settings', () => {
    const settings = readFileSync(join(process.cwd(), 'src/app/settings/page.tsx'), 'utf8');
    expect(settings).toContain('DeleteAccount');
    const button = readFileSync(join(process.cwd(), 'src/components/DeleteAccount.tsx'), 'utf8');
    expect(button).toContain('Delete my account and data');
    expect(button).toContain('DELETE');
  });
});
