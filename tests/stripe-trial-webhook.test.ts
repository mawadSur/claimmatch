import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STRIPE_WEBHOOK_NOT_CONFIGURED } from '@/lib/stripe';

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  dripInserts: [] as Record<string, unknown>[],
  profile: { email: 'ada@example.com', full_name: 'Ada', email_opt_in: true } as Record<string, unknown>,
  stripe: null as {
    customers: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> };
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  } | null,
  reminders: [] as unknown[],
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
        if (table === 'drip_email_sends') return { data: null, error: null };
        return { data: null, error: null };
      };
      chain.upsert = async (row: Record<string, unknown>) => {
        h.upserts.push(row);
        h.row = { ...(h.row ?? {}), ...row };
        return { error: null };
      };
      chain.insert = async (row: Record<string, unknown>) => {
        h.dripInserts.push(row);
        return { error: null };
      };
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject);
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

vi.mock('@/lib/trial-will-end', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trial-will-end')>();
  return {
    ...actual,
    sendTrialWillEndReminder: async (input: unknown) => {
      h.reminders.push(input);
      return { sent: true };
    },
  };
});

import { POST as webhook } from '@/app/api/webhooks/stripe/route';

const USER_ID = '00000000-0000-4000-8000-000000000002';

function eventRequest(body = '{"id":"evt_trial"}') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=x' },
    body,
  });
}

describe('trial_will_end webhook', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test');
    h.row = null;
    h.upserts = [];
    h.dripInserts = [];
    h.reminders = [];
    h.stripe = {
      customers: { create: vi.fn(), retrieve: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      subscriptions: { retrieve: vi.fn() },
      webhooks: {
        constructEvent: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('handles customer.subscription.trial_will_end without failing the webhook', async () => {
    h.stripe?.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.trial_will_end',
      data: {
        object: {
          id: 'sub_trial',
          status: 'trialing',
          customer: 'cus_test',
          trial_end: 1_800_000_000,
          metadata: { user_id: USER_ID },
        },
      },
    });
    const res = await webhook(eventRequest());
    expect(res.status).toBe(200);
    expect(h.reminders).toHaveLength(1);
    expect(h.reminders[0]).toEqual(
      expect.objectContaining({
        userId: USER_ID,
        customerId: 'cus_test',
        subscription: expect.objectContaining({ id: 'sub_trial' }),
      }),
    );
  });

  it('still 503s when the webhook secret is unset', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const res = await webhook(eventRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(STRIPE_WEBHOOK_NOT_CONFIGURED);
  });
});
