import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags } from '@/lib/flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('brief 3 feature flags', () => {
  it('default off unless the env var is exactly 1', () => {
    expect(flags.verifiedFields()).toBe(false);
    expect(flags.calendarIcs()).toBe(false);
    expect(flags.closesInChips()).toBe(false);
    expect(flags.settlementOg()).toBe(false);
    expect(flags.noticeLookup()).toBe(false);
    expect(flags.formFieldOrder()).toBe(false);
    expect(flags.proofFeedback()).toBe(false);
    expect(flags.closedArchive()).toBe(false);
    expect(flags.closingSoonEmail()).toBe(false);
    expect(flags.homeNarrowing()).toBe(false);
    expect(flags.eligibilityQuestions()).toBe(false);
    expect(flags.formAutofill()).toBe(false);
    expect(flags.partnerWidget()).toBe(false);

    vi.stubEnv('VERIFIED_FIELDS_ENABLED', 'true');
    vi.stubEnv('CALENDAR_ICS_ENABLED', 'yes');
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '0');
    vi.stubEnv('SETTLEMENT_OG_ENABLED', '');
    vi.stubEnv('NOTICE_LOOKUP_ENABLED', 'true');
    vi.stubEnv('FORM_FIELD_ORDER_ENABLED', 'yes');
    vi.stubEnv('PROOF_FEEDBACK_ENABLED', '0');
    vi.stubEnv('CLOSED_ARCHIVE_ENABLED', '');
    vi.stubEnv('CLOSING_SOON_EMAIL_ENABLED', 'true');
    vi.stubEnv('HOME_NARROWING_ENABLED', 'on');
    vi.stubEnv('ELIGIBILITY_QUESTIONS_ENABLED', 'true');
    vi.stubEnv('FORM_AUTOFILL_ENABLED', 'yes');
    vi.stubEnv('PARTNER_WIDGET_ENABLED', 'on');
    expect(flags.verifiedFields()).toBe(false);
    expect(flags.calendarIcs()).toBe(false);
    expect(flags.closesInChips()).toBe(false);
    expect(flags.settlementOg()).toBe(false);
    expect(flags.noticeLookup()).toBe(false);
    expect(flags.formFieldOrder()).toBe(false);
    expect(flags.proofFeedback()).toBe(false);
    expect(flags.closedArchive()).toBe(false);
    expect(flags.closingSoonEmail()).toBe(false);
    expect(flags.homeNarrowing()).toBe(false);
    expect(flags.eligibilityQuestions()).toBe(false);
    expect(flags.formAutofill()).toBe(false);
    expect(flags.partnerWidget()).toBe(false);

    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    vi.stubEnv('CALENDAR_ICS_ENABLED', '1');
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '1');
    vi.stubEnv('SETTLEMENT_OG_ENABLED', '1');
    vi.stubEnv('NOTICE_LOOKUP_ENABLED', '1');
    vi.stubEnv('FORM_FIELD_ORDER_ENABLED', '1');
    vi.stubEnv('PROOF_FEEDBACK_ENABLED', '1');
    vi.stubEnv('CLOSED_ARCHIVE_ENABLED', '1');
    vi.stubEnv('CLOSING_SOON_EMAIL_ENABLED', '1');
    vi.stubEnv('HOME_NARROWING_ENABLED', '1');
    vi.stubEnv('ELIGIBILITY_QUESTIONS_ENABLED', '1');
    vi.stubEnv('FORM_AUTOFILL_ENABLED', '1');
    vi.stubEnv('PARTNER_WIDGET_ENABLED', '1');
    expect(flags.verifiedFields()).toBe(true);
    expect(flags.calendarIcs()).toBe(true);
    expect(flags.closesInChips()).toBe(true);
    expect(flags.settlementOg()).toBe(true);
    expect(flags.noticeLookup()).toBe(true);
    expect(flags.formFieldOrder()).toBe(true);
    expect(flags.proofFeedback()).toBe(true);
    expect(flags.closedArchive()).toBe(true);
    expect(flags.closingSoonEmail()).toBe(true);
    expect(flags.homeNarrowing()).toBe(true);
    expect(flags.eligibilityQuestions()).toBe(true);
    expect(flags.formAutofill()).toBe(true);
    expect(flags.partnerWidget()).toBe(true);
  });
});
