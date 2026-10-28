import { describe, expect, it } from 'vitest';
import { parsePayoutAmount, parsePayoutDate, isPayoutMethod } from '@/lib/payout-report';

describe('payout amount', () => {
  it('accepts 0–100000 and rejects anything else', () => {
    expect(parsePayoutAmount(null)).toEqual({ ok: true, amount: null });
    expect(parsePayoutAmount(0)).toEqual({ ok: true, amount: 0 });
    expect(parsePayoutAmount(25.5)).toEqual({ ok: true, amount: 25.5 });
    expect(parsePayoutAmount(100000)).toEqual({ ok: true, amount: 100000 });
    expect(parsePayoutAmount(-1).ok).toBe(false);
    expect(parsePayoutAmount(100000.01).ok).toBe(false);
    expect(parsePayoutAmount('nope').ok).toBe(false);
  });

  it('accepts a calendar date and payout methods', () => {
    expect(parsePayoutDate('2026-10-28')).toEqual({ ok: true, date: '2026-10-28' });
    expect(parsePayoutDate('28/10/2026').ok).toBe(false);
    expect(isPayoutMethod('check')).toBe(true);
    expect(isPayoutMethod('wire')).toBe(false);
  });
});
