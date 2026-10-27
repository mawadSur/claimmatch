import { afterEach, describe, expect, it, vi } from 'vitest';
import { flags } from '@/lib/flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('brief 3a feature flags', () => {
  it('default off unless the env var is exactly 1', () => {
    expect(flags.verifiedFields()).toBe(false);
    expect(flags.calendarIcs()).toBe(false);
    expect(flags.closesInChips()).toBe(false);
    expect(flags.settlementOg()).toBe(false);

    vi.stubEnv('VERIFIED_FIELDS_ENABLED', 'true');
    vi.stubEnv('CALENDAR_ICS_ENABLED', 'yes');
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '0');
    vi.stubEnv('SETTLEMENT_OG_ENABLED', '');
    expect(flags.verifiedFields()).toBe(false);
    expect(flags.calendarIcs()).toBe(false);
    expect(flags.closesInChips()).toBe(false);
    expect(flags.settlementOg()).toBe(false);

    vi.stubEnv('VERIFIED_FIELDS_ENABLED', '1');
    vi.stubEnv('CALENDAR_ICS_ENABLED', '1');
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '1');
    vi.stubEnv('SETTLEMENT_OG_ENABLED', '1');
    expect(flags.verifiedFields()).toBe(true);
    expect(flags.calendarIcs()).toBe(true);
    expect(flags.closesInChips()).toBe(true);
    expect(flags.settlementOg()).toBe(true);
  });
});
