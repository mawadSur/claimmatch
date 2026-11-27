import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIMMATCH_TRIAL_DAYS } from '@/lib/copy';
import { resetStripeClientForTests, STRIPE_NOT_CONFIGURED, STRIPE_WEBHOOK_NOT_CONFIGURED } from '@/lib/stripe';

const USER_ID = '00000000-0000-4000-8000-000000000002';

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  profile: { is_admin: false, is_internal: false } as { is_admin: boolean; is_internal: boolean },
  stripe: null as {
    customers: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> };
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  } | null,
  user: null as { id: string; email?: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'profiles') return { data: h.profile, error: null };
        if (table === 'subscriptions') return { data: h.row, error: null };
        return { data: null, error: null };
      };
      chain.upsert = async (row: Record<string, unknown>) => {
        h.upserts.push(row);
        h.row = { ...(h.row ?? {}), ...row };
        return { error: null };
      };
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          table === 'subscriptions'
            ? { data: h.row ? [h.row] : [], error: null }
            : { data: [], error: null },
        ).then(resolve, reject);
      return chain;
    },
  }),
}));

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...actual,
    stripeClient: () => h.stripe,
  };
});

vi.mock('@/lib/supabase/request-user', () => ({
  AUTH_UNAVAILABLE: {
    error: 'We couldn’t confirm you’re logged in right now. Please try again in a minute.',
    code: 'auth_unavailable',
  },
  getRequestUser: async () =>
    h.user ? { user: h.user, supabase: {}, via: 'cookie' } : { user: null, supabase: null, via: 'cookie' },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
}));

import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as portal } from '@/app/api/billing/portal/route';
import { POST as webhook } from '@/app/api/webhooks/stripe/route';
import {
  createCheckoutSession,
  createPortalSession,
  isPaidMembershipStatus,
  staffBypassesMembership,
  userHasMembershipAccess,
} from '@/lib/subscriptions';

function json(url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? '{}' : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.row = null;
  h.upserts = [];
  h.profile = { is_admin: false, is_internal: false };
  h.user = { id: USER_ID, email: 'ada@example.com' };
  h.stripe = {
    customers: {
      create: vi.fn(async () => ({ id: 'cus_test' })),
      retrieve: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/cs_test' })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: 'https://billing.stripe.test/session' })),
      },
    },
    subscriptions: {
      retrieve: vi.fn(async () => ({
        id: 'sub_test',
        status: 'trialing',
        customer: 'cus_test',
        trial_end: 1_800_000_000,
        current_period_end: 1_800_086_400,
        cancel_at_period_end: false,
        metadata: { user_id: USER_ID },
      })),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('STRIPE_PRICE_ID', 'price_test');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
  vi.stubEnv('SUBSCRIPTION_BILLING_ENABLED', '');
  resetStripeClientForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetStripeClientForTests();
});

describe('membership access', () => {
  it('treats trialing and active as paid', () => {
    expect(isPaidMembershipStatus('trialing')).toBe(true);
    expect(isPaidMembershipStatus('active')).toBe(true);
    expect(isPaidMembershipStatus('past_due')).toBe(false);
    expect(isPaidMembershipStatus('canceled')).toBe(false);
    expect(isPaidMembershipStatus('incomplete')).toBe(false);
  });

  it('lets admins, internal profiles, and INTERNAL_EMAILS skip the gate', () => {
    expect(staffBypassesMembership({ isAdmin: true })).toBe(true);
    expect(staffBypassesMembership({ isInternal: true })).toBe(true);
    vi.stubEnv('INTERNAL_EMAILS', 'qa@lawsuitai.org');
    expect(staffBypassesMembership({ email: 'qa@lawsuitai.org' })).toBe(true);
    expect(staffBypassesMembership({ email: 'ada@example.com' })).toBe(false);
  });

  it('is ungated when SUBSCRIPTION_BILLING_ENABLED is off', async () => {
    expect(await userHasMembershipAccess({ userId: USER_ID })).toBe(true);
  });

  it('requires a paid row when the billing flag is on', async () => {
    vi.stubEnv('SUBSCRIPTION_BILLING_ENABLED', '1');
    expect(await userHasMembershipAccess({ userId: USER_ID, email: 'ada@example.com' })).toBe(false);
    h.row = { user_id: USER_ID, status: 'trialing', cancel_at_period_end: false };
    expect(await userHasMembershipAccess({ userId: USER_ID, email: 'ada@example.com' })).toBe(true);
  });
});

describe('checkout and portal', () => {
  it('returns 503 from checkout when Stripe keys are missing', async () => {
    h.stripe = null;
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('STRIPE_PRICE_ID', '');
    const result = await createCheckoutSession({ userId: USER_ID, email: 'ada@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('stripe_not_configured');
      expect(result.error).toBe(STRIPE_NOT_CONFIGURED);
    }
    const res = await checkout(json('/api/billing/checkout'));
    expect(res.status).toBe(503);
  });

  it('creates a subscription Checkout Session with a 7-day trial', async () => {
    const result = await createCheckoutSession({ userId: USER_ID, email: 'ada@example.com', returnPath: '/settings' });
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/cs_test' });
    expect(h.stripe?.customers.create).toHaveBeenCalledWith({
      email: 'ada@example.com',
      metadata: { user_id: USER_ID },
    });
    expect(h.stripe?.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_test',
        client_reference_id: USER_ID,
        line_items: [{ price: 'price_test', quantity: 1 }],
        allow_promotion_codes: true,
        payment_method_collection: 'if_required',
        subscription_data: expect.objectContaining({
          trial_period_days: CLAIMMATCH_TRIAL_DAYS,
          metadata: { user_id: USER_ID },
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        }),
      }),
    );
    const res = await checkout(json('/api/billing/checkout', { return_to: '/settings' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/cs_test' });
  });

  it('starts the trial without collecting a card and cancels when no card arrives', async () => {
    const result = await createCheckoutSession({ userId: USER_ID, email: 'ada@example.com' });
    expect(result.ok).toBe(true);
    const params = (h.stripe?.checkout.sessions.create.mock.calls[0]?.[0] ?? {}) as {
      payment_method_collection?: string;
      allow_promotion_codes?: boolean;
      subscription_data?: {
        trial_period_days?: number;
        trial_settings?: { end_behavior?: { missing_payment_method?: string } };
      };
    };
    expect(params.payment_method_collection).toBe('if_required');
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.subscription_data?.trial_period_days).toBe(CLAIMMATCH_TRIAL_DAYS);
    expect(params.subscription_data?.trial_settings?.end_behavior?.missing_payment_method).toBe('cancel');
  });

  it('refuses checkout when the member is already trialing or active', async () => {
    h.row = {
      user_id: USER_ID,
      stripe_customer_id: 'cus_test',
      status: 'active',
      cancel_at_period_end: false,
    };
    const result = await createCheckoutSession({ userId: USER_ID, email: 'ada@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('already_subscribed');
    const res = await checkout(json('/api/billing/checkout'));
    expect(res.status).toBe(409);
  });

  it('opens the billing portal for an existing customer', async () => {
    h.row = {
      user_id: USER_ID,
      stripe_customer_id: 'cus_test',
      status: 'trialing',
      cancel_at_period_end: false,
    };
    const result = await createPortalSession({ userId: USER_ID, returnPath: '/settings' });
    expect(result).toEqual({ ok: true, url: 'https://billing.stripe.test/session' });
    expect(h.stripe?.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_test',
      return_url: expect.stringContaining('/settings'),
    });
    const res = await portal(json('/api/billing/portal', { return_to: '/settings' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.test/session' });
  });

  it('passes STRIPE_PORTAL_CONFIGURATION_ID when set', async () => {
    vi.stubEnv('STRIPE_PORTAL_CONFIGURATION_ID', 'bpc_test_lawsuitai');
    h.row = {
      user_id: USER_ID,
      stripe_customer_id: 'cus_test',
      status: 'trialing',
      cancel_at_period_end: false,
    };
    const result = await createPortalSession({ userId: USER_ID, returnPath: '/settings' });
    expect(result).toEqual({ ok: true, url: 'https://billing.stripe.test/session' });
    expect(h.stripe?.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_test',
      return_url: expect.stringContaining('/settings'),
      configuration: 'bpc_test_lawsuitai',
    });
  });
});

describe('POST /api/webhooks/stripe', () => {
  it('returns 503 when the webhook secret is unset', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const res = await webhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=x' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(STRIPE_WEBHOOK_NOT_CONFIGURED);
  });

  it('syncs checkout.session.completed onto the member row', async () => {
    h.stripe?.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: USER_ID,
          customer: 'cus_test',
          subscription: 'sub_test',
          metadata: { user_id: USER_ID },
        },
      },
    });
    const res = await webhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=x' },
        body: '{"id":"evt_1"}',
      }),
    );
    expect(res.status).toBe(200);
    expect(h.stripe?.subscriptions.retrieve).toHaveBeenCalledWith('sub_test');
    expect(h.upserts.at(-1)).toEqual(
      expect.objectContaining({
        user_id: USER_ID,
        stripe_customer_id: 'cus_test',
        stripe_subscription_id: 'sub_test',
        status: 'trialing',
      }),
    );
  });

  it('marks the row canceled on customer.subscription.deleted', async () => {
    h.row = { user_id: USER_ID, stripe_customer_id: 'cus_test', status: 'active' };
    h.stripe?.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test',
          status: 'canceled',
          customer: 'cus_test',
          metadata: { user_id: USER_ID },
          cancel_at_period_end: false,
        },
      },
    });
    const res = await webhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=x' },
        body: '{"id":"evt_2"}',
      }),
    );
    expect(res.status).toBe(200);
    expect(h.upserts.at(-1)).toEqual(expect.objectContaining({ status: 'canceled' }));
  });

  it('revokes access when a cardless trial ends with no payment method', async () => {
    h.row = { user_id: USER_ID, stripe_customer_id: 'cus_test', status: 'trialing' };
    h.stripe?.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test',
          status: 'canceled',
          customer: 'cus_test',
          metadata: { user_id: USER_ID },
          trial_end: 1_700_000_000,
          cancel_at_period_end: false,
        },
      },
    });
    const res = await webhook(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=x' },
        body: '{"id":"evt_3"}',
      }),
    );
    expect(res.status).toBe(200);
    expect(h.upserts.at(-1)).toEqual(expect.objectContaining({ status: 'canceled' }));
    h.row = { user_id: USER_ID, status: 'canceled', cancel_at_period_end: false };
    vi.stubEnv('SUBSCRIPTION_BILLING_ENABLED', '1');
    expect(await userHasMembershipAccess({ userId: USER_ID, email: 'ada@example.com' })).toBe(false);
  });
});
