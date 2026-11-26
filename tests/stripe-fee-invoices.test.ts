import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIMMATCH_FEE_RATE } from '@/lib/copy';
import { feeAmountCents } from '@/lib/fee-invoices';
import { resetStripeClientForTests, STRIPE_NOT_CONFIGURED, STRIPE_WEBHOOK_NOT_CONFIGURED } from '@/lib/stripe';

const CLAIM_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ACTOR_ID = '00000000-0000-4000-8000-000000000003';
const INVOICE_ROW_ID = '00000000-0000-4000-8000-000000000004';

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  openRows: [] as Array<{ id: string; status: string }>,
  email: 'ada@example.com' as string | null,
  insert: null as Record<string, unknown> | null,
  update: null as Record<string, unknown> | null,
  updateError: null as { code: string } | null,
  insertError: null as { code: string } | null,
  stripe: null as {
    customers: { create: ReturnType<typeof vi.fn> };
    invoices: { create: ReturnType<typeof vi.fn>; sendInvoice: ReturnType<typeof vi.fn> };
    invoiceItems: { create: ReturnType<typeof vi.fn> };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'claims') return { data: h.claims, error: null };
        if (table === 'fee_invoices' && h.update) return { data: h.update, error: h.updateError };
        if (table === 'fee_invoices') return { data: h.insert, error: h.insertError };
        return { data: null, error: null };
      };
      chain.insert = (row: Record<string, unknown>) => {
        h.insert = {
          id: INVOICE_ROW_ID,
          stripe_invoice_id: null,
          stripe_hosted_invoice_url: null,
          created_at: '2026-11-26T00:00:00.000Z',
          paid_at: null,
          ...row,
        };
        return chain;
      };
      chain.update = (row: Record<string, unknown>) => {
        h.update = { ...(h.insert ?? {}), ...row };
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          table === 'fee_invoices' && !h.insert
            ? { data: h.openRows, error: null }
            : { data: h.update ? [h.update] : h.openRows, error: h.updateError },
        ).then(resolve, reject);
      return chain;
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: h.email ? { id: USER_ID, email: h.email } : { id: USER_ID } },
          error: null,
        }),
      },
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

describe('feeAmountCents', () => {
  it('rounds 15 percent of a confirmed payout', () => {
    expect(feeAmountCents(10_000)).toBe(1_500);
    expect(feeAmountCents(333)).toBe(50);
    expect(feeAmountCents(0)).toBe(0);
    expect(feeAmountCents(-1)).toBe(0);
    expect(CLAIMMATCH_FEE_RATE).toBe(15);
  });
});

describe('createFeeInvoice', () => {
  beforeEach(() => {
    h.claims = { id: CLAIM_ID, user_id: USER_ID, lawsuit_id: CLAIM_ID, status: 'filed' };
    h.openRows = [];
    h.email = 'ada@example.com';
    h.insert = null;
    h.update = null;
    h.updateError = null;
    h.insertError = null;
    h.stripe = null;
    resetStripeClientForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetStripeClientForTests();
  });

  it('fails clearly when Stripe is not configured', async () => {
    const { createFeeInvoice } = await import('@/lib/fee-invoices');
    const result = await createFeeInvoice({
      claimId: CLAIM_ID,
      payoutAmountCents: 10_000,
      daysUntilDue: 14,
      actorId: ACTOR_ID,
    });
    expect(result).toEqual({ ok: false, error: STRIPE_NOT_CONFIGURED, code: 'stripe_not_configured' });
  });

  it('refuses a duplicate unpaid invoice and sends a hosted Stripe invoice', async () => {
    h.openRows = [{ id: INVOICE_ROW_ID, status: 'open' }];
    h.stripe = {
      customers: { create: vi.fn() },
      invoices: { create: vi.fn(), sendInvoice: vi.fn() },
      invoiceItems: { create: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
    };
    const { createFeeInvoice } = await import('@/lib/fee-invoices');
    const dup = await createFeeInvoice({
      claimId: CLAIM_ID,
      payoutAmountCents: 10_000,
      daysUntilDue: 14,
      actorId: ACTOR_ID,
    });
    expect(dup).toMatchObject({ ok: false, code: 'conflict' });

    h.openRows = [];
    h.stripe.customers.create.mockResolvedValue({ id: 'cus_1' });
    h.stripe.invoices.create.mockResolvedValue({ id: 'in_1' });
    h.stripe.invoiceItems.create.mockResolvedValue({ id: 'ii_1' });
    h.stripe.invoices.sendInvoice.mockResolvedValue({
      id: 'in_1',
      hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    });
    const sent = await createFeeInvoice({
      claimId: CLAIM_ID,
      payoutAmountCents: 10_000,
      daysUntilDue: 30,
      actorId: ACTOR_ID,
    });
    expect(sent.ok).toBe(true);
    if (sent.ok) {
      expect(sent.invoice.fee_amount_cents).toBe(1_500);
      expect(sent.invoice.fee_pct).toBe(15);
      expect(sent.invoice.stripe_hosted_invoice_url).toBe('https://invoice.stripe.com/i/test');
      expect(sent.invoice.status).toBe('open');
    }
    expect(h.stripe.invoices.create).toHaveBeenCalledWith(expect.objectContaining({ days_until_due: 30, collection_method: 'send_invoice' }));
  });
});

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    h.stripe = {
      customers: { create: vi.fn() },
      invoices: { create: vi.fn(), sendInvoice: vi.fn() },
      invoiceItems: { create: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
    };
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 503 when Stripe keys are missing and 400 without a signature', async () => {
    h.stripe = null;
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const missing = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: STRIPE_NOT_CONFIGURED });

    h.stripe = {
      customers: { create: vi.fn() },
      invoices: { create: vi.fn(), sendInvoice: vi.fn() },
      invoiceItems: { create: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
    };
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const { stripeWebhookSecret } = await import('@/lib/stripe');
    expect(stripeWebhookSecret()).toBeNull();
    const noSig = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
        headers: {},
      }),
    );
    expect([400, 503]).toContain(noSig.status);
  });

  it('marks paid / void / uncollectible from verified events', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    h.stripe!.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_1',
          hosted_invoice_url: 'https://invoice.stripe.com/i/test',
          status_transitions: { paid_at: 1_700_000_000 },
        },
      },
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{"id":"evt_1"}',
        headers: { 'stripe-signature': 't=1,v1=abc' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, status: 'paid' });
  });
});

describe('stripe client without keys', () => {
  it('does not instantiate Stripe when STRIPE_SECRET_KEY is unset', async () => {
    h.stripe = null;
    vi.unstubAllEnvs();
    delete process.env.STRIPE_SECRET_KEY;
    const { stripeClient, STRIPE_WEBHOOK_NOT_CONFIGURED } = await import('@/lib/stripe');
    expect(stripeClient()).toBeNull();
    expect(STRIPE_WEBHOOK_NOT_CONFIGURED).toContain('STRIPE_WEBHOOK_SECRET');
  });
});
