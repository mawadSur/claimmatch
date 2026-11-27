/**
 * Stripe customer.subscription.trial_will_end reminder. One email per
 * Stripe subscription. Flag-off is a no-op. Copy uses Stripe trial_end and
 * the published $19.99/month membership price (or Stripe's unit_amount when
 * the subscription item has one).
 */
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { membershipPriceCopy } from '@/lib/copy';
import { sendTrialWillEndEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { isDripEligibleProfile } from '@/lib/onboarding-drip';
import { stripeClient } from '@/lib/stripe';
import { unixToIso } from '@/lib/subscriptions';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { canonicalUrl, formatDeadline } from '@/lib/utils';

export const TRIAL_WILL_END_KIND = 'trial_will_end' as const;

export interface TrialWillEndFacts {
  subscriptionId: string;
  trialEndIso: string | null;
  trialEndLabel: string | null;
  priceCopy: string;
  manageUrl: string;
}

export function trialPriceCopy(sub: {
  items?: { data?: Array<{ price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null }> };
}): string {
  const price = sub.items?.data?.[0]?.price;
  if (
    price &&
    typeof price.unit_amount === 'number' &&
    Number.isFinite(price.unit_amount) &&
    price.unit_amount > 0 &&
    price.recurring?.interval === 'month'
  ) {
    return membershipPriceCopy(price.unit_amount);
  }
  return membershipPriceCopy();
}

export function trialWillEndFacts(input: {
  subscriptionId: string;
  trialEndUnix?: unknown;
  priceCopy: string;
  manageUrl: string;
  now?: Date;
}): TrialWillEndFacts | null {
  const id = input.subscriptionId.trim();
  if (!id) return null;
  const trialEndIso = unixToIso(input.trialEndUnix);
  const trialEndLabel = trialEndIso ? formatDeadline(trialEndIso.slice(0, 10)) : null;
  return {
    subscriptionId: id,
    trialEndIso,
    trialEndLabel,
    priceCopy: input.priceCopy,
    manageUrl: input.manageUrl,
  };
}

export async function alreadySentTrialWillEnd(
  stripeSubscriptionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data, error } = await createServiceClient()
    .from('drip_email_sends')
    .select('id')
    .eq('kind', TRIAL_WILL_END_KIND)
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  if (error) {
    console.error('[trial-will-end] send-log read failed', { code: error.code });
    return false;
  }
  return Boolean(data);
}

async function portalUrlForCustomer(customerId: string | null): Promise<string> {
  const fallback = canonicalUrl('/settings');
  if (!customerId) return fallback;
  const stripe = stripeClient();
  if (!stripe) return fallback;
  try {
    const portalConfigId = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: fallback,
      ...(portalConfigId ? { configuration: portalConfigId } : {}),
    });
    return session.url || fallback;
  } catch {
    return fallback;
  }
}

export async function sendTrialWillEndReminder(input: {
  userId: string;
  customerId: string | null;
  subscription: {
    id?: unknown;
    trial_end?: unknown;
    items?: { data?: Array<{ price?: { unit_amount?: number | null; recurring?: { interval?: string | null } | null } | null }> };
  };
}): Promise<{ sent: boolean; reason?: string }> {
  if (!flags.trialWillEndEmail()) return { sent: false, reason: 'flag_off' };
  const gate = commercialEmailPrereqs();
  if (!gate.ok) return { sent: false, reason: gate.reason };
  if (!isSupabaseConfigured()) return { sent: false, reason: 'supabase is not configured' };

  const subscriptionId = typeof input.subscription.id === 'string' ? input.subscription.id : '';
  if (!subscriptionId) return { sent: false, reason: 'missing_subscription_id' };
  if (await alreadySentTrialWillEnd(subscriptionId)) return { sent: false, reason: 'already_sent' };

  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, email_opt_in')
    .eq('id', input.userId)
    .maybeSingle();
  if (error) {
    console.error('[trial-will-end] profile read failed', { code: error.code });
    return { sent: false, reason: 'profile_read_failed' };
  }
  if (!isDripEligibleProfile(profile ?? {})) {
    return { sent: false, reason: 'not_opted_in' };
  }
  const email = profile?.email as string;

  const manageUrl = await portalUrlForCustomer(input.customerId);
  const facts = trialWillEndFacts({
    subscriptionId,
    trialEndUnix: input.subscription.trial_end,
    priceCopy: trialPriceCopy(input.subscription),
    manageUrl,
  });
  if (!facts) return { sent: false, reason: 'missing_facts' };

  const sentOk = await sendTrialWillEndEmail(email, {
    name: (profile?.full_name as string | null) ?? undefined,
    trialEndLabel: facts.trialEndLabel,
    priceCopy: facts.priceCopy,
    manageUrl: facts.manageUrl,
    to: email,
  });
  if (!sentOk) return { sent: false, reason: 'send_failed' };

  const { error: writeError } = await supabase.from('drip_email_sends').insert({
    user_id: input.userId,
    kind: TRIAL_WILL_END_KIND,
    claim_id: null,
    lawsuit_id: null,
    stripe_subscription_id: subscriptionId,
  });
  if (writeError && writeError.code !== '23505') {
    console.error('[trial-will-end] send log failed:', writeError.message);
  }
  return { sent: true };
}
