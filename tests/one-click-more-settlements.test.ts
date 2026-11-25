import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIVE_ONE_CLICK_SETTLEMENTS } from '../scripts/one-click-five-settlements';
import { MORE_ONE_CLICK_SETTLEMENTS } from '../scripts/one-click-more-settlements';
import { ownerApplySql } from '../scripts/one-click-five-settlements';

describe('additional one-click settlement drafts', () => {
  it('covers three catalog slugs that are not already in the five', () => {
    expect(MORE_ONE_CLICK_SETTLEMENTS).toHaveLength(3);
    const slugs = MORE_ONE_CLICK_SETTLEMENTS.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(3);
    const existing = new Set(FIVE_ONE_CLICK_SETTLEMENTS.map((row) => row.slug));
    for (const slug of slugs) {
      expect(existing.has(slug), slug).toBe(false);
    }
    for (const row of MORE_ONE_CLICK_SETTLEMENTS) {
      expect(row.deadline >= '2026-12-20', row.slug).toBe(true);
      expect(row.officialUrl).toMatch(/^https:\/\//);
      expect(row.formUrl).toMatch(/submit-claim/);
      expect(row.spec.member_fields.some((field) => field.field === 'legal_name' && field.required)).toBe(true);
      expect(row.policy.agent_filing).toBe('allowed');
    }
  });

  it('prints owner-apply SQL that inserts drafts and never auto-approves', () => {
    const sql = ownerApplySql(MORE_ONE_CLICK_SETTLEMENTS, {
      script: 'scripts/one-click-more-settlements.ts',
      label: 'Additional one-click',
    });
    expect(sql).toContain('insert into public.filing_specs');
    expect(sql).toContain('insert into public.filing_policies');
    expect(sql).not.toMatch(/filing_approve_spec|status = 'approved'/);
    for (const row of MORE_ONE_CLICK_SETTLEMENTS) {
      expect(sql).toContain(row.slug);
    }
  });

  it('dry-run can look up the additional slugs and still refuses --submit', () => {
    const src = readFileSync(fileURLToPath(new URL('../scripts/one-click-dry-run.ts', import.meta.url)), 'utf8');
    expect(src).toContain('MORE_ONE_CLICK_SETTLEMENTS');
    expect(src).toContain("Refusing --submit. This script never submits a claim.");
    expect(src).toContain('send code');
  });
});
