/**
 * Stripe webhook: mark fee invoices paid / void / uncollectible.
 * Verifies STRIPE_WEBHOOK_SECRET. Idempotent on stripe_invoice_id.
 * Missing keys return 503 and never throw at import.
 */
import { applyStripeInvoiceStatus, type FeeInvoiceStatus } from '@/lib/fee-invoices';
import { stripeClient, stripeWebhookSecret, STRIPE_NOT_CONFIGURED, STRIPE_WEBHOOK_NOT_CONFIGURED } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_BY_EVENT: Record<string, FeeInvoiceStatus> = {
  'invoice.paid': 'paid',
  'invoice.payment_succeeded': 'paid',
  'invoice.voided': 'void',
  'invoice.marked_uncollectible': 'uncollectible',
};

export async function POST(req: Request) {
  const stripe = stripeClient();
  const webhookSecret = stripeWebhookSecret();
  if (!stripe) {
    return Response.json({ error: STRIPE_NOT_CONFIGURED }, { status: 503 });
  }
  if (!webhookSecret) {
    return Response.json({ error: STRIPE_WEBHOOK_NOT_CONFIGURED }, { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 });
  }
  const payload = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }
  const status = STATUS_BY_EVENT[event.type];
  if (!status) {
    return Response.json({ received: true, ignored: event.type });
  }
  const invoice = event.data.object as {
    id?: unknown;
    hosted_invoice_url?: unknown;
    status_transitions?: { paid_at?: unknown } | null;
  };
  const stripeInvoiceId = typeof invoice.id === 'string' ? invoice.id : '';
  if (!stripeInvoiceId) {
    return Response.json({ error: 'Invoice event missing id.' }, { status: 400 });
  }
  const hosted = typeof invoice.hosted_invoice_url === 'string' ? invoice.hosted_invoice_url : null;
  const paidAt =
    status === 'paid'
      ? typeof invoice.status_transitions?.paid_at === 'number'
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString()
      : null;
  const ok = await applyStripeInvoiceStatus({
    stripeInvoiceId,
    status,
    paidAt,
    hostedInvoiceUrl: hosted,
  });
  if (!ok) {
    return Response.json({ error: 'Could not update the invoice.' }, { status: 503 });
  }
  return Response.json({ received: true, status });
}
