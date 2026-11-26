/**
 * Lazy Stripe client. Never instantiate at import: missing STRIPE_SECRET_KEY
 * must not break builds, CI, or public pages.
 */
import Stripe from 'stripe';

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || null;
}

export function stripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret || null;
}

let cached: Stripe | null | undefined;

/** Null when STRIPE_SECRET_KEY is unset. Callers must handle that. */
export function stripeClient(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = stripeSecretKey();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key);
  return cached;
}

/** Tests only: drop the cached client after stubbing env. */
export function resetStripeClientForTests(): void {
  cached = undefined;
}

export const STRIPE_NOT_CONFIGURED =
  'Stripe is not configured. Set STRIPE_SECRET_KEY in Vercel before sending fee invoices.';

export const STRIPE_WEBHOOK_NOT_CONFIGURED =
  'Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET in Vercel.';
