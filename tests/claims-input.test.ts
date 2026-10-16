import { describe, expect, it } from 'vitest';
import {
  eligibilitySummary,
  hasSelfFileColumns,
  latestFiledOnDate,
  parseClaimPatch,
  parseStartTracking,
  proofNeed,
  toClaimView,
  validateFiledOn,
} from '@/lib/claims';

const NOW = new Date('2026-10-16T18:00:00Z');

function message(body: unknown): string {
  const r = parseClaimPatch(body, NOW);
  if (r.ok) throw new Error(`expected a validation error for ${JSON.stringify(body)}`);
  return r.message;
}

describe('parseClaimPatch', () => {
  it('accepts a report with no number and no date', () => {
    expect(parseClaimPatch({ action: 'report_filed' }, NOW)).toEqual({ ok: true, value: { action: 'report_filed' } });
    expect(parseClaimPatch({ action: 'report_filed', confirmation_number: '  ', filed_on: '' }, NOW)).toEqual({
      ok: true,
      value: { action: 'report_filed' },
    });
    expect(parseClaimPatch({ action: 'report_filed', confirmation_number: null }, NOW)).toMatchObject({ ok: true });
  });

  it('trims the confirmation number and accepts letters, digits, spaces and - # / .', () => {
    expect(
      parseClaimPatch({ action: 'report_filed', confirmation_number: '  AB 12/3-4.5 #6  ', filed_on: '2026-10-15' }, NOW),
    ).toEqual({
      ok: true,
      value: { action: 'report_filed', confirmation_number: 'AB 12/3-4.5 #6', filed_on: '2026-10-15' },
    });
  });

  it('rejects bad confirmation numbers with a plain message', () => {
    expect(message({ action: 'add_confirmation', confirmation_number: 'ab' })).toMatch(/too short/);
    expect(message({ action: 'add_confirmation', confirmation_number: 'x'.repeat(65) })).toMatch(/too long/);
    expect(message({ action: 'add_confirmation', confirmation_number: 'ABC!123' })).toMatch(/only letters/);
    expect(message({ action: 'add_confirmation', confirmation_number: '<script>' })).toMatch(/only letters/);
    expect(message({ action: 'add_confirmation', confirmation_number: '---' })).toMatch(/letter or number/);
    expect(message({ action: 'add_confirmation' })).toBe('Enter your confirmation number.');
    expect(message({ action: 'add_confirmation', confirmation_number: 12345 })).toMatch(/as text/);
  });

  it('returns a 400-style message for bad dates instead of throwing', () => {
    expect(message({ action: 'report_filed', filed_on: 'garbage' })).toMatch(/isn't valid/);
    expect(message({ action: 'report_filed', filed_on: '2026-02-30' })).toMatch(/isn't valid/);
    expect(message({ action: 'report_filed', filed_on: '2099-01-01' })).toMatch(/future/);
    expect(message({ action: 'report_filed', filed_on: '1999-12-31' })).toMatch(/2000 or later/);
    expect(message({ action: 'report_filed', filed_on: 20261015 })).toMatch(/YYYY-MM-DD/);
  });

  it('rejects unknown actions and non-object bodies', () => {
    expect(message({ action: 'file_for_me' })).toBe('Unknown action.');
    expect(message({ action: 'withdraw' })).toBe('Unknown action.');
    expect(message({})).toBe('Unknown action.');
    expect(message(null)).toBe('Invalid request.');
    expect(message('report_filed')).toBe('Invalid request.');
  });
});

describe('validateFiledOn', () => {
  it('allows today anywhere in the world but nothing later', () => {
    expect(latestFiledOnDate(NOW)).toBe('2026-10-17');
    expect(validateFiledOn('2026-10-16', NOW)).toEqual({ ok: true, value: '2026-10-16' });
    expect(validateFiledOn('2026-10-17', NOW)).toMatchObject({ ok: true });
    expect(validateFiledOn('2026-10-18', NOW)).toMatchObject({ ok: false });
    expect(validateFiledOn('2000-01-01', NOW)).toMatchObject({ ok: true });
  });
});

describe('parseStartTracking', () => {
  it('needs a settlement id', () => {
    const id = '7f1c1c8e-0a51-4f3f-9a49-0f1e6a1d3b21';
    expect(parseStartTracking({ lawsuit_id: id })).toEqual({ ok: true, value: { lawsuitId: id } });
    expect(parseStartTracking({ lawsuit_id: 'sample-databreach' })).toMatchObject({ ok: false });
    expect(parseStartTracking({})).toMatchObject({ ok: false, message: 'Pick a settlement first.' });
    expect(parseStartTracking(null)).toMatchObject({ ok: false });
  });

  it('flags the retired e-sign payload so it can never start a claim', () => {
    expect(
      parseStartTracking({ lawsuit_id: '7f1c1c8e-0a51-4f3f-9a49-0f1e6a1d3b21', signature_name: 'Jo Smith' }),
    ).toMatchObject({ ok: false, legacyPayload: true });
  });
});

describe('content helpers', () => {
  it('drops the feed placeholder for who qualifies', () => {
    expect(eligibilitySummary('Open to eligible US residents.')).toBeNull();
    expect(eligibilitySummary('  ')).toBeNull();
    expect(eligibilitySummary(null)).toBeNull();
    expect(eligibilitySummary('Residents of: CA, NY')).toBe('Residents of: CA, NY');
  });

  it('never reads unknown proof as "none"', () => {
    expect(proofNeed({ proof_required: true })).toBe('required');
    expect(proofNeed({ proof_required: false, eligibility: { proof: 'yes' } })).toBe('required');
    expect(
      proofNeed({ proof_required: false, eligibility: { notes: 'Proof of purchase is optional but may increase your claim amount.' } }),
    ).toBe('optional');
    expect(proofNeed({ proof_required: false, eligibility: { proof: 'no' } })).toBe('none');
    expect(proofNeed({ proof_required: false, eligibility: {} })).toBe('unknown');
    expect(proofNeed({})).toBe('unknown');
  });

  it('sends the browser no legacy e-sign or money columns', () => {
    const view = toClaimView({
      id: 'c1',
      lawsuit_id: 'l1',
      lawsuit_title: 'Example',
      status: 'submitted',
      receipt_number: 42,
      filed_at: '2026-07-01T00:00:00Z',
      signature_name: 'Jo',
      authorization_ip: '203.0.113.9',
      estimated_value: 50,
      confirmation_number: null,
    });
    expect(Object.keys(view).sort()).toEqual(
      [
        'confirmation_number',
        'corrective_notice_answered_at',
        'created_at',
        'id',
        'lawsuit_id',
        'lawsuit_title',
        'reported_filed_at',
        'status',
        'user_filed_on',
      ].sort(),
    );
  });

  it('detects rows from before migration 0006', () => {
    expect(hasSelfFileColumns({ id: 'x', status: 'submitted' })).toBe(false);
    expect(
      hasSelfFileColumns({ confirmation_number: null, reported_filed_at: null, corrective_notice_answered_at: null }),
    ).toBe(true);
  });
});
