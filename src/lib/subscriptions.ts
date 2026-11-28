/**
 * Stripe membership: 7-day free trial, then $19.99/month.
 * Easy submit and new-claim alerts require an active or trialing row when
 * SUBSCRIPTION_BILLING_ENABLED=1. Writes are service-role only.
 */
import type Stripe from 'stripe';
import { CLAIMMATCH_TRIAL_DAYS } from '@/lib/copy';
import { flags } from '@/lib/flags';
import { isInternalEmail } from '@/lib/internal-users';
import {
  stripeClient,
  stripePriceId,
  STRIPE_NOT_CONFIGURED,
  STRIPE_PRICE_NOT_CONFIGURED,
} from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/server';
import { canonicalUrl } from '@/lib/utils';

export const MEMBERSHIP_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const PAID_ACCESS = new Set<MembershipStatus>(['trialing', 'active']);
const TERMINAL_STATUSES = new Set<MembershipStatus>(['canceled', 'incomplete_expired']);

/** A customer-only row is created before checkout, so it isn't itself a subscription. */
export function hasOngoingSubscription(row: SubscriptionRow | null): boolean {
  return Boolean(row && (isPaidMembershipStatus(row.status) ||
    (row.stripe_subscription_id && !TERMINAL_STATUSES.has(row.status))));
}

export function isPaidMembershipStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && PAID_ACCESS.has(status as MembershipStatus);
}

function asMembershipStatus(value: unknown): MembershipStatus | null {
  return typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value)
    ? (value as MembershipStatus)
    : null;
}

export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: MembershipStatus;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

export function unixToIso(unix: unknown): string | null {
  return typeof unix === 'number' && Number.isFinite(unix)
    ? new Date(unix * 1000).toISOString()
    : null;
}

/** Stripe 2024+ keeps current_period_end on the subscription; 2025+ may put it on items. */
export function subscriptionPeriodEndUnix(sub: {
  current_period_end?: unknown;
  items?: { data?: Array<{ current_period_end?: unknown }> };
}): number | null {
  if (typeof sub.current_period_end === 'number') return sub.current_period_end;
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  return typeof itemEnd === 'number' ? itemEnd : null;
}

export function staffBypassesMembership(args: {
  isAdmin?: boolean | null;
  isInternal?: boolean | null;
  email?: string | null;
}): boolean {
  return Boolean(args.isAdmin || args.isInternal || isInternalEmail(args.email));
}

/**
 * When billing is off, everyone has access (Easy submit stays ungated).
 * Admins and INTERNAL_EMAILS testers always have access so they can review.
 */
export async function userHasMembershipAccess(args: {
  userId: string;
  email?: string | null;
  isAdmin?: boolean | null;
  isInternal?: boolean | null;
}): Promise<boolean> {
  if (!flags.subscriptionBilling()) return true;
  if (staffBypassesMembership(args)) return true;
  if (args.isAdmin == null || args.isInternal == null) {
    const db = createServiceClient();
    const { data } = await db
      .from('profiles')
      .select('is_admin, is_internal')
      .eq('id', args.userId)
      .maybeSingle();
    if (
      staffBypassesMembership({
        email: args.email,
        isAdmin: Boolean(data?.is_admin),
        isInternal: Boolean(data?.is_internal),
      })
    ) {
      return true;
    }
  }
  const row = await loadSubscription(args.userId);
  return isPaidMembershipStatus(row?.status ?? null);
}

export async function loadSubscription(userId: string): Promise<SubscriptionRow | null> {
  try {
    return await readSubscription(userId);
  } catch (err) {
    console.error('[subscriptions] read failed', err instanceof Error ? err.name : typeof err);
    return null;
  }
}

// Checkout and webhook writes must distinguish an unreadable row from no row.
async function readSubscription(userId: string): Promise<SubscriptionRow | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('subscriptions')
    .select(
      'user_id, stripe_customer_id, stripe_subscription_id, status, trial_end, current_period_end, cancel_at_period_end, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const status = asMembershipStatus(data.status);
  if (!status) throw new Error('Unknown membership status');
  return {
    user_id: data.user_id as string,
    stripe_customer_id: (data.stripe_customer_id as string | null) ?? null,
    stripe_subscription_id: (data.stripe_subscription_id as string | null) ?? null,
    status,
    trial_end: (data.trial_end as string | null) ?? null,
    current_period_end: (data.current_period_end as string | null) ?? null,
    cancel_at_period_end: Boolean(data.cancel_at_period_end),
    updated_at: (data.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function paidMembershipUserIds(userIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const db = createServiceClient();
  const { data, error } = await db
    .from('subscriptions')
    .select('user_id, status')
    .in('user_id', unique)
    .in('status', [...PAID_ACCESS]);
  if (error) {
    console.error('[subscriptions] paid set failed', { code: error.code });
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
}

export type UpsertSubscriptionPatch = {
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status: MembershipStatus;
  trial_end?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

async function writeSubscription(patch: UpsertSubscriptionPatch, expected: SubscriptionRow | null): Promise<boolean> {
  const db = createServiceClient();
  const row = {
    user_id: patch.user_id,
    status: patch.status,
    updated_at: new Date().toISOString(),
    ...(patch.stripe_customer_id !== undefined ? { stripe_customer_id: patch.stripe_customer_id } : {}),
    ...(patch.stripe_subscription_id !== undefined
      ? { stripe_subscription_id: patch.stripe_subscription_id }
      : {}),
    ...(patch.trial_end !== undefined ? { trial_end: patch.trial_end } : {}),
    ...(patch.current_period_end !== undefined ? { current_period_end: patch.current_period_end } : {}),
    ...(patch.cancel_at_period_end !== undefined
      ? { cancel_at_period_end: patch.cancel_at_period_end }
      : {}),
  };
  if (!expected) {
    // If another writer initialized this row, retry the webhook rather than
    // overwriting a subscription we haven't seen.
    const { error } = await db.from('subscriptions').insert(row);
    if (error && error.code !== '23505') console.error('[subscriptions] insert failed', { code: error.code });
    return !error;
  }
  let update = db.from('subscriptions').update(row).eq('user_id', patch.user_id)
    .eq('status', expected.status).eq('updated_at', expected.updated_at);
  update = expected.stripe_subscription_id === null
    ? update.is('stripe_subscription_id', null)
    : update.eq('stripe_subscription_id', expected.stripe_subscription_id);
  const { data, error } = await update.select('user_id').maybeSingle();
  if (error) console.error('[subscriptions] update failed', { code: error.code });
  return !error && Boolean(data);
}

export async function upsertFromStripeSubscription(args: {
  userId: string;
  customerId: string | null;
  subscription: {
    id?: unknown;
    status?: unknown;
    trial_end?: unknown;
    cancel_at_period_end?: unknown;
    current_period_end?: unknown;
    items?: { data?: Array<{ current_period_end?: unknown }> };
  };
}): Promise<boolean> {
  const status = asMembershipStatus(args.subscription.status);
  const subId = typeof args.subscription.id === 'string' ? args.subscription.id : null;
  if (!status || !subId) return false;
  const existing = await readSubscription(args.userId);
  if (existing?.stripe_customer_id && args.customerId && existing.stripe_customer_id !== args.customerId) {
    console.warn('[subscriptions] ignored event for a different customer');
    return true;
  }
  // A live read started before cancellation can finish after the terminal
  // event has already synced. Terminal Stripe subscriptions cannot restart.
  if (existing?.stripe_subscription_id === subId && TERMINAL_STATUSES.has(existing.status) &&
      !TERMINAL_STATUSES.has(status)) return true;
  // A new ongoing subscription can replace an ended one. An unrelated old
  // subscription's terminal event must never revoke the tracked membership.
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== subId &&
      (hasOngoingSubscription(existing) || TERMINAL_STATUSES.has(status))) {
    console.warn('[subscriptions] ignored event for a different subscription');
    return true;
  }
  return writeSubscription({
    user_id: args.userId,
    stripe_customer_id: args.customerId ?? existing?.stripe_customer_id,
    stripe_subscription_id: subId,
    status,
    trial_end: unixToIso(args.subscription.trial_end),
    current_period_end: unixToIso(subscriptionPeriodEndUnix(args.subscription)),
    cancel_at_period_end: Boolean(args.subscription.cancel_at_period_end),
  }, existing);
}

export type CheckoutResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error: string;
      code: 'billing_disabled' | 'stripe_not_configured' | 'already_subscribed' | 'service_unavailable';
    };

export async function createCheckoutSession(args: {
  userId: string;
  email: string | null;
  returnPath?: string;
}): Promise<CheckoutResult> {
  if (!flags.subscriptionBilling()) {
    return { ok: false, error: 'Membership checkout is not available right now.', code: 'billing_disabled' };
  }
  const stripe = stripeClient();
  const priceId = stripePriceId();
  if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED, code: 'stripe_not_configured' };
  if (!priceId) return { ok: false, error: STRIPE_PRICE_NOT_CONFIGURED, code: 'stripe_not_configured' };

  const alreadySubscribed = {
    ok: false, error: 'You already have a Lawsuit AI subscription. Manage it from Settings.', code: 'already_subscribed',
  } as const;
  const successPath = safeReturnPath(args.returnPath, '/settings?billing=success');
  const cancelPath = '/pricing?billing=canceled';
  try {
    const existing = await readSubscription(args.userId);
    if (hasOngoingSubscription(existing)) return alreadySubscribed;

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: args.email || undefined,
        metadata: { user_id: args.userId },
      }, { idempotencyKey: `membership-customer:${args.userId}` });
      customerId = customer.id;
      if (!await writeSubscription({
        user_id: args.userId,
        stripe_customer_id: customerId,
        status: existing?.status ?? 'incomplete',
      }, existing)) throw new Error('Could not persist billing customer');
    }

    const { data: [latestSession] } = await stripe.checkout.sessions.list({ customer: customerId, limit: 1 });
    // One trial per Stripe customer. A later paid checkout is fine; a second
    // trial is not. Refuse while any non-terminal subscription still exists.
    let trialEligible = !(existing?.trial_end || existing?.stripe_subscription_id);
    for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: 'all' })) {
      const status = asMembershipStatus(subscription.status);
      if (!status || !TERMINAL_STATUSES.has(status)) return alreadySubscribed;
      trialEligible = false;
    }
    if (latestSession?.mode === 'subscription' && latestSession.status === 'open' &&
        latestSession.client_reference_id === args.userId) {
      if (trialEligible || latestSession.metadata?.membership_checkout === 'paid') {
        if (!latestSession.url) throw new Error('Open checkout is missing its URL');
        return { ok: true, url: latestSession.url };
      }
      // Legacy open sessions may still grant a repeat trial. If expiration
      // races with completion, Stripe rejects it and the member can retry.
      await stripe.checkout.sessions.expire(latestSession.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: args.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(trialEligible
          ? {
              trial_period_days: CLAIMMATCH_TRIAL_DAYS,
              // Cardless trial: when no payment method is added before the trial ends,
              // Stripe cancels the subscription instead of issuing an unpayable invoice.
              trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
            }
          : {}),
        metadata: { user_id: args.userId },
      },
      metadata: { user_id: args.userId, membership_checkout: trialEligible ? 'trial' : 'paid' },
      success_url: canonicalUrl(successPath),
      cancel_url: canonicalUrl(cancelPath),
      allow_promotion_codes: true,
      // The trial's first invoice is zero, so Stripe skips the card form entirely.
      payment_method_collection: trialEligible ? 'if_required' : 'always',
    }, { idempotencyKey: `membership-checkout:${customerId}:${latestSession?.id ?? 'first'}` });
    if (!session.url) {
      return { ok: false, error: 'Stripe did not return a checkout URL.', code: 'service_unavailable' };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    console.error('[subscriptions] checkout failed', err instanceof Error ? err.name : typeof err);
    return { ok: false, error: 'Stripe could not start checkout.', code: 'service_unavailable' };
  }
}

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code: 'stripe_not_configured' | 'no_customer' | 'service_unavailable' };

export async function createPortalSession(args: {
  userId: string;
  returnPath?: string;
}): Promise<PortalResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED, code: 'stripe_not_configured' };
  const existing = await loadSubscription(args.userId);
  const customerId = existing?.stripe_customer_id;
  if (!customerId) {
    return {
      ok: false,
      error: 'No billing account yet. Start membership from Settings first.',
      code: 'no_customer',
    };
  }
  try {
    const portalConfigId = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: canonicalUrl(safeReturnPath(args.returnPath, '/settings')),
      ...(portalConfigId ? { configuration: portalConfigId } : {}),
    });
    if (!session.url) {
      return { ok: false, error: 'Stripe did not return a portal URL.', code: 'service_unavailable' };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    console.error('[subscriptions] portal failed', err instanceof Error ? err.name : typeof err);
    return { ok: false, error: 'Stripe could not open billing.', code: 'service_unavailable' };
  }
}

export async function userIdFromStripeCustomer(customerId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) {
    console.error('[subscriptions] customer lookup failed', { code: error.code });
    return null;
  }
  if (typeof data?.user_id === 'string') return data.user_id;

  const stripe = stripeClient();
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) return null;
    const uid = (customer as Stripe.Customer).metadata?.user_id;
    return typeof uid === 'string' && uid ? uid : null;
  } catch (err) {
    console.error('[subscriptions] stripe customer retrieve failed', err instanceof Error ? err.name : typeof err);
    return null;
  }
}

function safeReturnPath(path: string | undefined, fallback: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return fallback;
  return path;
}
