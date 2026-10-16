import { describe, expect, it } from 'vitest';
import { normalizeLegalContact } from '@/lib/legal-contact';
import { productionContactProblem } from '@/lib/contact-email.mjs';
import { pickClosingSoon } from '@/lib/closing-soon';
import { parseSettingsInput } from '@/lib/settings-input';

describe('normalizeLegalContact', () => {
  it('keeps real values, trimmed', () => {
    expect(
      normalizeLegalContact({
        email: '  privacy@claimmatch-test.org ',
        legalEntity: ' ClaimMatch LLC ',
        postalAddress: ' 1 Main St\\nSpringfield, IL 62701 ',
      }),
    ).toEqual({
      email: 'privacy@claimmatch-test.org',
      legalEntity: 'ClaimMatch LLC',
      postalAddress: '1 Main St\nSpringfield, IL 62701',
    });
  });

  it('renders nothing for unset, blank or placeholder values', () => {
    const empty = { email: null, legalEntity: null, postalAddress: null };
    expect(normalizeLegalContact({})).toEqual(empty);
    expect(normalizeLegalContact({ email: '', legalEntity: '   ', postalAddress: undefined })).toEqual(empty);
    expect(
      normalizeLegalContact({
        email: '{CONTACT_EMAIL}',
        legalEntity: '{LEGAL_ENTITY}',
        postalAddress: '{POSTAL_ADDRESS}',
      }),
    ).toEqual(empty);
    expect(normalizeLegalContact({ email: 'TBD', legalEntity: 'todo', postalAddress: 'N/A' })).toEqual(empty);
    expect(normalizeLegalContact({ postalAddress: '<postal address>' }).postalAddress).toBeNull();
  });

  it('drops malformed or undeliverable email addresses', () => {
    for (const email of ['not-an-email', 'a@b', 'you@example.com', 'ops@mail.example.org', 'x@localhost', 'a b@c.com']) {
      expect(normalizeLegalContact({ email }).email).toBeNull();
    }
  });
});

describe('production build guard for the contact inbox', () => {
  it('stops a production build without a working inbox for data requests', () => {
    expect(productionContactProblem({ VERCEL_ENV: 'production' })).toMatch(/NEXT_PUBLIC_CONTACT_EMAIL must be set/);
    for (const email of ['', '{CONTACT_EMAIL}', 'TBD', 'privacy@example.com', 'not-an-email']) {
      expect(productionContactProblem({ VERCEL_ENV: 'production', NEXT_PUBLIC_CONTACT_EMAIL: email }), email).not.toBeNull();
    }
    expect(
      productionContactProblem({ VERCEL_ENV: 'production', NEXT_PUBLIC_CONTACT_EMAIL: 'privacy@claimmatch-test.org' }),
    ).toBeNull();
  });

  it('leaves CI, local and preview builds alone', () => {
    expect(productionContactProblem({})).toBeNull();
    expect(productionContactProblem({ VERCEL_ENV: 'preview' })).toBeNull();
    expect(productionContactProblem({ VERCEL_ENV: 'development' })).toBeNull();
  });
});

describe('pickClosingSoon', () => {
  const row = (title: string, deadline: string | null) => ({ title, deadline });

  it('orders by deadline, soonest first, and trims to the limit', () => {
    const rows = [
      row('C', '2026-12-01'),
      row('A', '2026-10-20'),
      row('B', '2026-11-05'),
      row('D', '2027-01-15'),
    ];
    expect(pickClosingSoon(rows, 3).map((r) => r.title)).toEqual(['A', 'B', 'C']);
  });

  it('leaves out rows with no deadline or an unreadable one', () => {
    const rows = [row('No date', null), row('Bad date', 'soon'), row('Dated', '2026-10-30')];
    expect(pickClosingSoon(rows).map((r) => r.title)).toEqual(['Dated']);
  });

  it('breaks ties by title so the order is stable', () => {
    const rows = [row('Zeta', '2026-11-01'), row('Alpha', '2026-11-01')];
    expect(pickClosingSoon(rows).map((r) => r.title)).toEqual(['Alpha', 'Zeta']);
  });

  it('returns nothing for an empty list or a zero limit', () => {
    expect(pickClosingSoon([])).toEqual([]);
    expect(pickClosingSoon([row('A', '2026-10-20')], 0)).toEqual([]);
  });

  it('does not change the input array', () => {
    const rows = [row('B', '2026-11-05'), row('A', '2026-10-20')];
    pickClosingSoon(rows);
    expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
  });
});

describe('parseSettingsInput', () => {
  it('never writes the retired SMS opt-in or unknown fields', () => {
    const result = parseSettingsInput({
      email_opt_in: false,
      sms_opt_in: true,
      is_admin: true,
      phone: '+1 (555) 123-4567',
    });
    expect(result).toEqual({
      ok: true,
      patch: { email_opt_in: false, phone: '+1 (555) 123-4567' },
    });
  });

  it('accepts a known state in any case and clears emptied fields', () => {
    expect(parseSettingsInput({ state: 'ca', full_name: '  Jane Doe ' })).toEqual({
      ok: true,
      patch: { state: 'CA', full_name: 'Jane Doe' },
    });
    expect(parseSettingsInput({ state: '', phone: '  ', full_name: '' })).toEqual({
      ok: true,
      patch: { state: null, phone: null, full_name: null },
    });
  });

  it('rejects an unknown state, a bad phone or a long name with a plain message', () => {
    expect(parseSettingsInput({ state: 'ZZ' })).toEqual({ ok: false, error: 'Choose a state from the list.' });
    expect(parseSettingsInput({ phone: 'call me maybe' })).toEqual({
      ok: false,
      error: 'Use only numbers, spaces and + - ( ) in your phone number.',
    });
    expect(parseSettingsInput({ full_name: 'x'.repeat(121) })).toEqual({
      ok: false,
      error: 'Keep your name under 120 characters.',
    });
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'text', 42, [1, 2]]) {
      expect(parseSettingsInput(body)).toEqual({ ok: false, error: 'Invalid request body.' });
    }
  });

  it('returns an empty patch when nothing changes', () => {
    expect(parseSettingsInput({})).toEqual({ ok: true, patch: {} });
  });
});
