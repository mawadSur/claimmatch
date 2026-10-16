import { describe, expect, it } from 'vitest';
import { checkScriptTarget, PRODUCTION_PROJECT_REF } from '@/lib/scraper/env-guard';
import robots from '@/app/robots';
import { matchProfile, scoreLawsuit } from '@/lib/matching';
import { normalizeProof, proofDetail, proofLabel, proofStatus } from '@/lib/proof';
import type { Lawsuit, Profile } from '@/lib/types';

/** A fake Supabase JWT whose payload names a project ref. */
function jwtFor(ref: string): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ ref, role: 'service_role' })}.signature`;
}

describe('seed and scrape scripts refuse production', () => {
  const local = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };

  it('run only when CLAIMMATCH_ENV is local or staging', () => {
    expect(checkScriptTarget({ ...local, CLAIMMATCH_ENV: 'local' })).toEqual({ ok: true, env: 'local' });
    expect(checkScriptTarget({ ...local, CLAIMMATCH_ENV: 'staging' })).toEqual({ ok: true, env: 'staging' });
    for (const env of [undefined, '', 'production', 'prod', 'LOCAL', 'dev']) {
      expect(checkScriptTarget({ ...local, CLAIMMATCH_ENV: env }).ok).toBe(false);
    }
  });

  it('always refuse the production project, whatever CLAIMMATCH_ENV says', () => {
    const prodUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
    expect(checkScriptTarget({ CLAIMMATCH_ENV: 'local', NEXT_PUBLIC_SUPABASE_URL: prodUrl }).ok).toBe(false);
    expect(
      checkScriptTarget({ CLAIMMATCH_ENV: 'staging', NEXT_PUBLIC_SUPABASE_URL: prodUrl.toUpperCase() }).ok,
    ).toBe(false);
    expect(checkScriptTarget({ CLAIMMATCH_ENV: 'local', SUPABASE_URL: prodUrl }).ok).toBe(false);
    expect(
      checkScriptTarget({
        ...local,
        CLAIMMATCH_ENV: 'local',
        SUPABASE_SERVICE_ROLE_KEY: jwtFor(PRODUCTION_PROJECT_REF),
      }).ok,
    ).toBe(false);
  });

  it('accept a staging key for another project', () => {
    expect(
      checkScriptTarget({
        NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref123.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: jwtFor('stagingref123'),
        CLAIMMATCH_ENV: 'staging',
      }).ok,
    ).toBe(true);
  });
});

describe('robots.txt', () => {
  it('blocks private and one-click paths for every crawler in a single group', () => {
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(false);
    const group = rules as { userAgent: string; allow: string; disallow: string[] };
    expect(group.userAgent).toBe('*');
    expect(group.disallow).toEqual(
      expect.arrayContaining(['/admin', '/dashboard', '/settings', '/api', '/claim', '/onboarding', '/unsubscribe']),
    );
  });
});

describe('proof labels', () => {
  const base = { proof_required: false, eligibility: {} } as Pick<Lawsuit, 'proof_required' | 'eligibility'>;

  it('reads the feed value and never says None', () => {
    expect(proofLabel({ ...base, eligibility: { proof: 'yes' } })).toBe('Required');
    expect(proofLabel({ ...base, eligibility: { proof: 'no' } })).toBe('Not required');
    expect(proofLabel({ ...base, eligibility: { proof: 'optional' } })).toBe('Optional');
    expect(proofLabel({ ...base, eligibility: { proof: 'unknown' } })).toBe('Unknown');
    for (const proof of ['yes', 'no', 'optional', 'unknown'] as const) {
      const text = `${proofLabel({ ...base, eligibility: { proof } })} ${proofDetail({ ...base, eligibility: { proof } })}`;
      expect(text).not.toMatch(/\bnone\b/i);
    }
  });

  it('treats the old boolean false as unknown, not "no proof needed"', () => {
    expect(proofStatus(base)).toBe('unknown');
    expect(proofLabel({ ...base, proof_required: true })).toBe('Required');
    expect(proofDetail(base)).toMatch(/check the official notice/i);
  });

  it('normalizes odd values', () => {
    expect(normalizeProof(' YES ')).toBe('yes');
    expect(normalizeProof('maybe')).toBe('unknown');
    expect(normalizeProof(undefined)).toBe('unknown');
  });
});

describe('matching never uses health answers', () => {
  const profile = (attributes: Record<string, unknown>, state = 'CA') =>
    ({ id: 'u', state, attributes }) as unknown as Profile;
  const lawsuitWith = (eligibility: Lawsuit['eligibility']) =>
    ({ id: 'l', eligibility }) as unknown as Lawsuit;

  it('never matches on the medication answer', () => {
    const result = scoreLawsuit(profile({ took_medication: true }), lawsuitWith({ requires: ['took_medication'] }));
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).not.toMatch(/medic/i);
  });

  it('ignores health keys in soft criteria', () => {
    const result = scoreLawsuit(
      profile({ took_medication: true, owns_vehicle: true }),
      lawsuitWith({ requires: ['owns_vehicle'], anyOf: { took_medication: [true] } }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.join(' ')).not.toMatch(/medic|took medication/i);
  });

  it('gives plain reasons with no percentages', () => {
    const results = matchProfile(profile({ had_data_breach: true }), [
      lawsuitWith({ requires: ['had_data_breach'] }),
      lawsuitWith({ states: ['CA'] }),
    ]);
    expect(results.length).toBe(2);
    for (const r of results) expect(r.reasons.join(' ')).not.toContain('%');
  });
});
