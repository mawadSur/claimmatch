import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const privacy = read('src/app/privacy/page.tsx');
const terms = read('src/app/terms/page.tsx');
const signup = read('src/app/signup/page.tsx');

describe('Terms and Privacy', () => {
  it.each([
    ['privacy', privacy],
    ['terms', terms],
  ])('%s is labeled interim and pending legal review', (_name, src) => {
    expect(src).toContain('Interim, pending legal review.');
  });

  it.each([
    ['privacy', privacy],
    ['terms', terms],
  ])('%s never prints a placeholder or an unregistered address', (_name, src) => {
    expect(src).not.toMatch(/\{CONTACT_EMAIL\}|\{POSTAL_ADDRESS\}|\{LEGAL_ENTITY\}/);
    expect(src).not.toMatch(/@claimmatch\.(app|com)/);
    // Contact details come only from the env-backed helper.
    expect(src).toContain("from '@/lib/legal-contact'");
  });

  it('privacy names every processor and SettleSignal', () => {
    for (const name of ['Supabase', 'Vercel', 'Web Analytics', 'PostHog', 'Resend', 'SettleSignal']) {
      expect(privacy).toContain(name);
    }
    expect(privacy).toContain('We do not share any user data with SettleSignal');
  });

  it('privacy gives an accurate cookie statement', () => {
    expect(privacy).toMatch(/Sign-in cookies/);
    expect(privacy).toMatch(/PostHog stores a\s+random ID in a cookie/);
    expect(privacy).toMatch(/invite code in a cookie for 30 days/);
    expect(privacy).toMatch(/First-touch campaign cookie/);
    expect(privacy).toMatch(/Do Not Track/);
    expect(privacy).toMatch(/Vercel Web Analytics does not use cookies/);
    expect(privacy).not.toMatch(/only to keep you signed in|necessary to keep you signed in/i);
  });

  it('privacy says the medication question is no longer asked', () => {
    expect(privacy).toMatch(/prescription medication/);
    expect(privacy).toMatch(/no longer\s+asked/);
  });

  it('privacy words data rights as requests', () => {
    expect(privacy).toMatch(/You can request a copy/);
  });

  it('terms have no filing, fee or e-signature terms', () => {
    expect(terms).not.toMatch(/\be-?sign|\bsignature|\bauthoriz/i);
    expect(terms).not.toMatch(/\bour fee\b|\bfee of\b|percent of/i);
    expect(terms).toMatch(/does not file, submit or sign claims for you/);
    expect(terms).toMatch(/not a law firm/);
  });
});

describe('sign-up', () => {
  it('asks people to accept the Terms and Privacy Policy', () => {
    expect(signup).toContain('By creating an account, you agree to the');
    expect(signup).toContain('href="/terms"');
    expect(signup).toContain('href="/privacy"');
  });
});

describe('public pages', () => {
  it('home page drops the lookalike domain and the mock money notification', () => {
    const home = read('src/app/page.tsx');
    expect(home).not.toMatch(/claimmatch\.com|~\$\d|notification-walk/);
  });

  it('FAQ structured data goes through jsonLd()', () => {
    for (const rel of ['src/app/pricing/page.tsx', 'src/app/trust/page.tsx']) {
      const src = read(rel);
      expect(src).toContain('FAQPage');
      expect(src).toContain('__html: jsonLd(');
      expect(src).not.toContain('JSON.stringify');
    }
  });

  it('pricing says it is free and never takes a cut', () => {
    expect(read('src/app/pricing/page.tsx')).toMatch(/Free\.[\s\S]*We never take a cut of your settlement\./);
  });

  it('trust page credits SettleSignal as a data source, not an official one', () => {
    const trust = read('src/app/trust/page.tsx');
    expect(trust).toContain('SettleSignal');
    expect(trust).not.toMatch(/official sources?\b/i);
    expect(trust).not.toMatch(/human-reviewed|We name the administrator/i);
  });
});
