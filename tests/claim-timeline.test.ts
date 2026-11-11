import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_ANNOUNCED,
  announcedDateLabel,
  buildClaimTimeline,
  confirmationLabel,
  isUserReportedSubmitted,
  paymentTimingLabel,
  submittedDateLabel,
} from '@/lib/claim-timeline';

describe('isUserReportedSubmitted', () => {
  it('is true for reported_filed and submitted-with-confirmation', () => {
    expect(isUserReportedSubmitted({ status: 'reported_filed' })).toBe(true);
    expect(isUserReportedSubmitted({ status: 'submitted', confirmation_number: 'AB-12' })).toBe(true);
  });

  it('is false for unfiled and legacy submitted without a confirmation number', () => {
    expect(isUserReportedSubmitted({ status: 'self_file' })).toBe(false);
    expect(isUserReportedSubmitted({ status: 'submitted', confirmation_number: null })).toBe(false);
    expect(isUserReportedSubmitted({ status: 'submitted', confirmation_number: '  ' })).toBe(false);
  });
});

describe('timeline date labels never guess', () => {
  it('returns Not announced yet for missing, blank, and unparseable dates', () => {
    expect(announcedDateLabel(null)).toBe(UNKNOWN_ANNOUNCED);
    expect(announcedDateLabel(undefined)).toBe(UNKNOWN_ANNOUNCED);
    expect(announcedDateLabel('')).toBe(UNKNOWN_ANNOUNCED);
    expect(announcedDateLabel('   ')).toBe(UNKNOWN_ANNOUNCED);
    expect(announcedDateLabel('not-a-date')).toBe(UNKNOWN_ANNOUNCED);
    expect(announcedDateLabel('2026-02-30')).toBe(UNKNOWN_ANNOUNCED);
  });

  it('formats a real user-reported submitted date and does not invent one', () => {
    expect(submittedDateLabel({ user_filed_on: '2026-10-30', reported_filed_at: '2026-11-01T12:00:00Z' })).toMatch(
      /Oct 30, 2026/,
    );
    expect(submittedDateLabel({ user_filed_on: null, reported_filed_at: null })).toBe(UNKNOWN_ANNOUNCED);
  });

  it('uses listed payment timing only when text is present', () => {
    expect(paymentTimingLabel(null)).toBe(UNKNOWN_ANNOUNCED);
    expect(paymentTimingLabel('  ')).toBe(UNKNOWN_ANNOUNCED);
    expect(paymentTimingLabel('Checks mailed 60-90 days after final approval')).toBe(
      'Checks mailed 60-90 days after final approval',
    );
  });
});

describe('buildClaimTimeline', () => {
  it('is hidden until the user marked the claim submitted', () => {
    expect(buildClaimTimeline({ status: 'self_file' })).toBeNull();
  });

  it('shows unknown hearing and payment when the settlement has none', () => {
    const view = buildClaimTimeline({
      status: 'reported_filed',
      user_filed_on: '2026-10-30',
      confirmation_number: null,
      final_approval_hearing_at: null,
      payment_timing_text: null,
    });
    expect(view).not.toBeNull();
    expect(view?.steps.find((s) => s.id === 'submitted')?.value).toMatch(/Oct 30, 2026/);
    expect(view?.steps.find((s) => s.id === 'confirmation')?.value).toBe('Not added yet');
    expect(view?.steps.find((s) => s.id === 'hearing')).toMatchObject({
      value: UNKNOWN_ANNOUNCED,
      known: false,
    });
    expect(view?.steps.find((s) => s.id === 'payment')).toMatchObject({
      value: UNKNOWN_ANNOUNCED,
      known: false,
    });
  });

  it('shows listed hearing and payment timing only from the settlement record', () => {
    const view = buildClaimTimeline({
      status: 'submitted',
      confirmation_number: 'WMG-4X8K',
      user_filed_on: '2026-09-01',
      final_approval_hearing_at: '2027-03-15',
      payment_timing_text: 'Paid after the hearing, if approved',
    });
    expect(confirmationLabel({ confirmation_number: 'WMG-4X8K' })).toBe('WMG-4X8K');
    expect(view?.steps.find((s) => s.id === 'hearing')).toMatchObject({
      value: 'Mar 15, 2027',
      known: true,
    });
    expect(view?.steps.find((s) => s.id === 'payment')?.value).toBe('Paid after the hearing, if approved');
  });
});
