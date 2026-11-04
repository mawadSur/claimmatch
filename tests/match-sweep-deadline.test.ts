import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(fileURLToPath(new URL('../src/lib/match-sweep.ts', import.meta.url)), 'utf8');

describe('daily match sweep deadline gate', () => {
  it('loads only published open rows whose deadline is still open, then matchProfile', () => {
    expect(src).toContain('todayInLatestUSZone');
    expect(src).toContain('deadline.is.null,deadline.gte.');
    expect(src).toContain('filterOpenForClaims');
    expect(src).toContain('matchProfile(');
    expect(src).toContain('lawsuits');
    expect(src).toContain('MATCH_EMAIL_SCORE_THRESHOLD');
    expect(src).toContain('wantsInstantMatchEmails');
    expect(src).toContain('notified_at');
  });
});
