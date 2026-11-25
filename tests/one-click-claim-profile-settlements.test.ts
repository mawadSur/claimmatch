import { describe, expect, it } from 'vitest';
import { ownerApplySql } from '../scripts/one-click-five-settlements';
import { CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS } from '../scripts/one-click-claim-profile-settlements';

describe('Rolling Stone and Hyundai/Kia draft specs', () => {
  it('are draft desk policies that never auto-approve', () => {
    expect(CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS.map((r) => r.slug).sort()).toEqual([
      'hyundai-kia-vehicle-theft',
      'rolling-stone-magazine-lifetime-subscription',
    ]);
    const sql = ownerApplySql(CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS, {
      script: 'scripts/one-click-claim-profile-settlements.ts',
      label: 'test',
    });
    expect(sql).toContain('insert into public.filing_specs');
    expect(sql).not.toMatch(/filing_approve_spec|status = 'approved'/);
    const hyundai = CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS.find((r) => r.slug === 'hyundai-kia-vehicle-theft')!;
    expect(hyundai.spec.questions.some((q) => q.key === 'vin' && q.required)).toBe(true);
    const desk = hyundai.policy.channels.find((ch) => ch.type === 'filing_desk');
    expect(desk && desk.type === 'filing_desk' && desk.accepts_documents).toBe(true);
    const rs = CLAIM_PROFILE_ONE_CLICK_SETTLEMENTS.find((r) => r.slug === 'rolling-stone-magazine-lifetime-subscription')!;
    expect(rs.spec.questions.some((q) => q.key === 'subscription_email')).toBe(true);
  });
});
