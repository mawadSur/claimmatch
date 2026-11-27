import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  captureFunnelServerEvent,
  funnelEventProperties,
  shouldCaptureTrialStarted,
  stripePromoCodes,
} from '@/lib/analytics/funnel-events';
import { TRAFFIC_PROPERTY } from '@/lib/analytics/traffic';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('funnel event payloads', () => {
  it('attaches settlement_slug, claim_action_type, and cm_traffic_kind', () => {
    expect(
      funnelEventProperties({
        settlementSlug: 'acme-settlement',
        claimActionType: 'desk_file',
        trafficKind: 'qa',
      }),
    ).toEqual({
      [TRAFFIC_PROPERTY]: 'qa',
      settlement_slug: 'acme-settlement',
      slug: 'acme-settlement',
      claim_action_type: 'desk_file',
    });
  });

  it('defaults cm_traffic_kind to product (real traffic)', () => {
    expect(funnelEventProperties({})[TRAFFIC_PROPERTY]).toBe('product');
  });
});

describe('trial_started gate', () => {
  it('fires only for trialing subscriptions when the flag is on', () => {
    expect(shouldCaptureTrialStarted({ enabled: false, status: 'trialing' })).toBe(false);
    expect(shouldCaptureTrialStarted({ enabled: true, status: 'active' })).toBe(false);
    expect(shouldCaptureTrialStarted({ enabled: true, status: 'trialing' })).toBe(true);
  });
});

describe('stripe promo codes', () => {
  it('reads coupon ids and promotion codes from Stripe discounts', () => {
    expect(
      stripePromoCodes({
        discount: { coupon: { id: 'TEST20', name: 'QA' }, promotion_code: { code: 'qa-trial' } },
        discounts: [{ coupon: { id: 'other' } }, 'promo_abc'],
      }),
    ).toEqual(expect.arrayContaining(['test20', 'qa', 'qa-trial', 'other', 'promo_abc']));
  });
});

describe('captureFunnelServerEvent', () => {
  it('no-ops when FUNNEL_EVENTS_ENABLED is unset', async () => {
    const result = await captureFunnelServerEvent({
      event: ANALYTICS_EVENTS.trial_started,
      distinctId: 'user-1',
    });
    expect(result).toEqual({ captured: false, reason: 'flag_off' });
  });

  it('does not throw when the flag is on in tests (server capture is a no-op)', async () => {
    vi.stubEnv('FUNNEL_EVENTS_ENABLED', '1');
    const result = await captureFunnelServerEvent({
      event: ANALYTICS_EVENTS.easy_submit_started,
      distinctId: 'user-1',
      settlementSlug: 'acme',
      claimActionType: 'desk_file',
    });
    expect(result.reason).not.toBe('flag_off');
    expect(result.captured).toBe(false);
  });
});
