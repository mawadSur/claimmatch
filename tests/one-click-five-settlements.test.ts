import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIVE_ONE_CLICK_SETTLEMENTS, ownerApplySql } from '../scripts/one-click-five-settlements';

describe('five one-click settlement drafts', () => {
  it('covers five real catalog slugs with far-enough deadlines and a filing_desk channel', () => {
    expect(FIVE_ONE_CLICK_SETTLEMENTS).toHaveLength(5);
    const slugs = FIVE_ONE_CLICK_SETTLEMENTS.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(5);
    expect(slugs).not.toContain('lawsuit-ai-one-click-test-settlement');
    expect(slugs).toContain('realpage-rental-software-antitrust-settlement');
    expect(slugs).toContain('john-deere-repair-services-antitrust-settlement');
    for (const row of FIVE_ONE_CLICK_SETTLEMENTS) {
      expect(row.deadline >= '2026-12-20', row.slug).toBe(true);
      expect(row.officialUrl).toMatch(/^https:\/\//);
      expect(row.formUrl).toMatch(/^https:\/\//);
      expect(row.spec.member_fields.some((field) => field.field === 'legal_name' && field.required)).toBe(true);
      expect(row.policy.agent_filing).toBe('allowed');
      expect(row.policy.channels).toEqual([
        expect.objectContaining({ type: 'filing_desk', enabled: true }),
      ]);
    }
  });

  it('prints owner-apply SQL that inserts drafts and never auto-approves', () => {
    const sql = ownerApplySql();
    expect(sql).toContain('insert into public.filing_specs');
    expect(sql).toContain('insert into public.filing_policies');
    expect(sql).toMatch(/agent_filing[\s\S]*'allowed'/);
    expect(sql).not.toMatch(/filing_approve_spec|status = 'approved'/);
    for (const row of FIVE_ONE_CLICK_SETTLEMENTS) {
      expect(sql).toContain(row.slug);
    }
  });

  it('dry-run script refuses --submit', () => {
    const src = readFileSync(fileURLToPath(new URL('../scripts/one-click-dry-run.ts', import.meta.url)), 'utf8');
    expect(src).toContain("Refusing --submit. This script never submits a claim.");
    expect(src).toContain('export function refusesSubmit');
  });
});
