import { describe, expect, it } from 'vitest';
import { SETTLEMENT_OG_TAGLINE, settlementOgCopy } from '@/lib/settlement-og';

describe('settlementOgCopy', () => {
  it('uses only the stored title and deadline', () => {
    const copy = settlementOgCopy({
      title: 'Amazon Return Policy Settlement',
      deadline: '2026-12-01',
    });
    expect(copy.title).toBe('Amazon Return Policy Settlement');
    expect(copy.deadlineLine).toBe('Claim deadline Dec 1, 2026');
    expect(copy.tagline).toBe(SETTLEMENT_OG_TAGLINE);
    expect(copy.tagline).toBe('Free to check, file on the official site');
  });

  it('omits a deadline line when none is stored, and never mentions a payout', () => {
    const copy = settlementOgCopy({
      title: 'Mystery Settlement',
      deadline: null,
    });
    expect(copy.deadlineLine).toBeNull();
    expect(JSON.stringify(copy)).not.toMatch(/payout|\$|million|users/i);
  });
});
