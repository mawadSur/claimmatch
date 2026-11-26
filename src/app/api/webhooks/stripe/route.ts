/**
 * Stripe webhook: sync membership rows.
 * Verifies STRIPE_WEBHOOK_SECRET. Idempotent upserts on user_id.
 * Missing keys return 503 and never throw at import.
 */
import type Stripe from 'stripe';
import {
  stripeClient,
  stripeWebhookSecret,
  STRIPE_NOT_CONFIGURED,
  STRIPE_WEBHOOK_NOT_CONFIGURED,
} from '@/lib/stripe';
import {
  upsertFromStripeSubscription,
  upsertSubscription,
  userIdFromStripeCustomer,
} from '@/lib/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

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
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }
  if (!HANDLED.has(event.type)) {
    return Response.json({ received: true, ignored: event.type });
  }

  try {
    const ok = await handleEvent(stripe, event);
    if (!ok) {
      return Response.json({ error: 'Could not sync the subscription.' }, { status: 503 });
    }
  } catch (err) {
    console.error('[stripe-webhook] handler failed', err instanceof Error ? err.name : typeof err);
    return Response.json({ error: 'Could not sync the subscription.' }, { status: 503 });
  }
  return Response.json({ received: true, type: event.type });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        (typeof session.client_reference_id === 'string' && session.client_reference_id) ||
        (typeof session.metadata?.user_id === 'string' && session.metadata.user_id) ||
        null;
      const customerId = customerIdOf(session.customer);
      const subId = subscriptionIdOf(session.subscription);
      if (!userId || !subId) return true;
      const sub = await stripe.subscriptions.retrieve(subId);
      return upsertFromStripeSubscription({
        userId,
        customerId: customerId ?? customerIdOf(sub.customer),
        subscription: sub,
      });
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      const userId =
        (typeof sub.metadata?.user_id === 'string' && sub.metadata.user_id) ||
        (customerId ? await userIdFromStripeCustomer(customerId) : null);
      if (!userId) return true;
      const status = event.type === 'customer.subscription.deleted' ? { ...sub, status: 'canceled' as const } : sub;
      return upsertFromStripeSubscription({ userId, customerId, subscription: status });
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdOf(
        (invoice as { subscription?: unknown }).subscription ??
          invoice.parent?.subscription_details?.subscription,
      );
      const customerId = customerIdOf(invoice.customer);
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const userId =
          (typeof sub.metadata?.user_id === 'string' && sub.metadata.user_id) ||
          (customerId ? await userIdFromStripeCustomer(customerId) : null);
        if (!userId) return true;
        return upsertFromStripeSubscription({
          userId,
          customerId: customerId ?? customerIdOf(sub.customer),
          subscription: { ...sub, status: 'past_due' },
        });
      }
      if (!customerId) return true;
      const userId = await userIdFromStripeCustomer(customerId);
      if (!userId) return true;
      return upsertSubscription({ user_id: userId, stripe_customer_id: customerId, status: 'past_due' });
    }
    default:
      return true;
  }
}

function customerIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function subscriptionIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}
