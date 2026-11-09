import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(fileURLToPath(new URL('../src/lib/match-sweep.ts', import.meta.url)), 'utf8');

describe('daily match sweep deadline gate', () => {
  it('loads published open rows as the catalog does (guided ones by their official deadline), then matchProfile', () => {
    // The catalog's read: deadline today or later, or a guided slug (src/lib/settlement-guides.ts).
    expect(src).toContain('.or(catalogDeadlineFilter(now))');
    // The guides replace the feed's deadline and payout before the open rule runs again.
    expect(src).toContain('openGuidedCatalog(');
    expect(src).not.toContain('deadline.is.null,deadline.gte.');
    expect(src).toContain('matchProfile(');
    expect(src).toContain('lawsuits');
    expect(src).toContain('MATCH_EMAIL_SCORE_THRESHOLD');
    expect(src).toContain('wantsInstantMatchEmails');
    expect(src).toContain('notified_at');
  });
});
