import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EIGHT_EASY_SUBMIT_SETTLEMENTS,
  EIGHT_EASY_SUBMIT_SLUGS,
  eightEasySubmitOwnerApplySql,
} from '../scripts/one-click-eight-easy-submit';

const EXPECTED = [
  'rolling-stone-magazine-lifetime-subscription',
  'hyundai-kia-vehicle-theft',
  'tenet-healthcare-pixel-tracking-settlement',
  'seatgeek-ticket-fees-nevada-class-action-settlement',
  'dental-intelligence-5-75m-privacy-class-action-settlement',
  'blue-ridge-rural-water-company-data-breach-class-action-settlement',
  'vida-y-salud-health-systems-data-breach-class-action-settlement',
  'educational-computer-systems-data-breach-class-action-settlement',
] as const;

describe('eight Easy submit owner-apply drafts', () => {
  it('covers the eight counsel-cleared slugs and never Kroger or Allstate Arizona', () => {
    expect(EIGHT_EASY_SUBMIT_SETTLEMENTS).toHaveLength(8);
    expect(EIGHT_EASY_SUBMIT_SLUGS).toEqual(expect.arrayContaining([...EXPECTED]));
    expect(new Set(EIGHT_EASY_SUBMIT_SLUGS).size).toBe(8);
    expect(EIGHT_EASY_SUBMIT_SLUGS).not.toContain('kroger-prescription-drug-prices-class-action-settlement');
    expect(EIGHT_EASY_SUBMIT_SLUGS).not.toContain('allstate-arizona-depreciation-settlement');
    expect(EIGHT_EASY_SUBMIT_SLUGS).not.toContain('realpage-rental-software-antitrust-settlement');
    expect(EIGHT_EASY_SUBMIT_SLUGS).not.toContain('john-deere-repair-services-antitrust-settlement');
  });

  it('prints idempotent owner-apply SQL with a backup, drafts only, and rollback comments', () => {
    const sql = eightEasySubmitOwnerApplySql();
    expect(sql).toContain('owner_apply_eight_easy_submit_backup_20261126');
    expect(sql).toContain('insert into public.filing_specs');
    expect(sql).toContain('insert into public.filing_policies');
    expect(sql).toContain("claim_action_type = 'desk_file'");
    expect(sql).toMatch(/agent_filing[\s\S]*'allowed'/);
    expect(sql).not.toMatch(/filing_approve_spec|status = 'approved'/);
    expect(sql).toContain('-- Rollback');
    expect(sql).toContain('Never delete approved spec or policy rows');
    expect(sql).not.toContain('kroger-prescription-drug-prices-class-action-settlement');
    expect(sql).not.toContain('allstate-arizona-depreciation-settlement');
    for (const slug of EXPECTED) {
      expect(sql).toContain(slug);
    }
  });
});

describe('backup table RLS owner-apply', () => {
  it('enables RLS on both public backup tables with IF EXISTS and a rollback comment', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('../supabase/owner-apply/lock-backup-tables-rls.sql', import.meta.url)),
      'utf8',
    );
    expect(sql).toMatch(/Owner-apply only/);
    expect(sql).toMatch(/alter table if exists public\.lawsuits_top20_backup_2026_11 enable row level security/);
    expect(sql).toMatch(
      /alter table if exists public\.owner_apply_eight_easy_submit_backup_20261126 enable row level security/,
    );
    expect(sql).toMatch(/disable row level security/);
    expect(sql).toMatch(/revoke all on table public\.lawsuits_top20_backup_2026_11 from anon, authenticated/);
    expect(sql).not.toMatch(/create policy/i);
  });
});
