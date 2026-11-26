/**
 * Recovery-only Easy submit fee invoices. Admin records a confirmed payout
 * and Stripe emails a hosted invoice. Lawsuit AI never holds settlement funds.
 */
import { CLAIMMATCH_FEE_RATE } from '@/lib/copy';
import { stripeClient, STRIPE_NOT_CONFIGURED } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/server';

export const FEE_INVOICE_STATUSES = ['draft', 'open', 'paid', 'void', 'uncollectible'] as const;
export type FeeInvoiceStatus = (typeof FEE_INVOICE_STATUSES)[number];

export interface FeeInvoiceRow {
  id: string;
  claim_id: string;
  user_id: string;
  payout_amount_cents: number;
  fee_pct: number;
  fee_amount_cents: number;
  stripe_invoice_id: string | null;
  stripe_hosted_invoice_url: string | null;
  status: FeeInvoiceStatus;
  created_at: string;
  paid_at: string | null;
}

export function feeAmountCents(payoutAmountCents: number, rate = CLAIMMATCH_FEE_RATE): number {
  if (!Number.isInteger(payoutAmountCents) || payoutAmountCents <= 0) return 0;
  return Math.round((payoutAmountCents * rate) / 100);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateFeeInvoiceResult =
  | { ok: true; invoice: FeeInvoiceRow }
  | { ok: false; error: string; code: 'stripe_not_configured' | 'invalid_request' | 'not_found' | 'conflict' | 'service_unavailable' };

export async function createFeeInvoice(args: {
  claimId: string;
  payoutAmountCents: number;
  daysUntilDue: 14 | 30;
  actorId: string;
}): Promise<CreateFeeInvoiceResult> {
  if (!UUID.test(args.claimId)) return { ok: false, error: 'Enter a valid claim id.', code: 'invalid_request' };
  if (!Number.isInteger(args.payoutAmountCents) || args.payoutAmountCents <= 0) {
    return { ok: false, error: 'Enter a confirmed payout greater than $0.', code: 'invalid_request' };
  }
  const fee = feeAmountCents(args.payoutAmountCents);
  if (fee < 50) {
    return {
      ok: false,
      error: 'The fee is under Stripe’s $0.50 minimum. Check the payout amount.',
      code: 'invalid_request',
    };
  }
  const stripe = stripeClient();
  if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED, code: 'stripe_not_configured' };

  const db = createServiceClient();
  const { data: claim, error: claimErr } = await db
    .from('claims')
    .select('id, user_id, lawsuit_id, status')
    .eq('id', args.claimId)
    .maybeSingle();
  if (claimErr) {
    console.error('[fee-invoices] claim read failed', { code: claimErr.code });
    return { ok: false, error: 'Could not load the claim.', code: 'service_unavailable' };
  }
  if (!claim || typeof claim.user_id !== 'string') {
    return { ok: false, error: 'No claim with that id.', code: 'not_found' };
  }

  const { data: openRows, error: openErr } = await db
    .from('fee_invoices')
    .select('id, status')
    .eq('claim_id', args.claimId)
    .in('status', ['draft', 'open']);
  if (openErr) {
    console.error('[fee-invoices] open invoice read failed', { code: openErr.code });
    return { ok: false, error: 'Could not check existing invoices.', code: 'service_unavailable' };
  }
  if ((openRows ?? []).length > 0) {
    return { ok: false, error: 'This claim already has an unpaid fee invoice.', code: 'conflict' };
  }

  const { data: userRes, error: userErr } = await db.auth.admin.getUserById(claim.user_id);
  if (userErr || !userRes.user?.email) {
    return { ok: false, error: 'This member has no email on file for an invoice.', code: 'invalid_request' };
  }
  const email = userRes.user.email;

  const { data: inserted, error: insertErr } = await db
    .from('fee_invoices')
    .insert({
      claim_id: args.claimId,
      user_id: claim.user_id,
      payout_amount_cents: args.payoutAmountCents,
      fee_pct: CLAIMMATCH_FEE_RATE,
      fee_amount_cents: fee,
      status: 'draft',
    })
    .select('*')
    .maybeSingle();
  if (insertErr || !inserted) {
    console.error('[fee-invoices] insert failed', { code: insertErr?.code });
    return { ok: false, error: 'Could not record the invoice.', code: 'service_unavailable' };
  }

  try {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: claim.user_id, claim_id: args.claimId },
    });
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: args.daysUntilDue,
      metadata: {
        fee_invoice_id: inserted.id,
        claim_id: args.claimId,
        user_id: claim.user_id,
        actor_id: args.actorId,
      },
      auto_advance: true,
    });
    if (!invoice.id) throw new Error('Stripe invoice missing id');
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: fee,
      currency: 'usd',
      description: `Lawsuit AI Easy submit recovery fee (${CLAIMMATCH_FEE_RATE} percent of recovered payout)`,
    });
    const sent = await stripe.invoices.sendInvoice(invoice.id);
    const { data: updated, error: updateErr } = await db
      .from('fee_invoices')
      .update({
        stripe_invoice_id: sent.id ?? invoice.id,
        stripe_hosted_invoice_url: sent.hosted_invoice_url ?? null,
        status: 'open',
      })
      .eq('id', inserted.id)
      .select('*')
      .maybeSingle();
    if (updateErr || !updated) {
      console.error('[fee-invoices] stripe id write failed', { code: updateErr?.code });
      return { ok: false, error: 'Invoice sent, but Lawsuit AI could not store the Stripe id.', code: 'service_unavailable' };
    }
    return { ok: true, invoice: updated as FeeInvoiceRow };
  } catch (err) {
    console.error('[fee-invoices] Stripe create failed', err instanceof Error ? err.name : typeof err);
    await db.from('fee_invoices').update({ status: 'void' }).eq('id', inserted.id).eq('status', 'draft');
    return { ok: false, error: 'Stripe could not create or send the invoice.', code: 'service_unavailable' };
  }
}

export async function applyStripeInvoiceStatus(args: {
  stripeInvoiceId: string;
  status: FeeInvoiceStatus;
  paidAt?: string | null;
  hostedInvoiceUrl?: string | null;
}): Promise<boolean> {
  const db = createServiceClient();
  const patch: Record<string, unknown> = { status: args.status };
  if (args.paidAt) patch.paid_at = args.paidAt;
  if (args.hostedInvoiceUrl) patch.stripe_hosted_invoice_url = args.hostedInvoiceUrl;
  const { error } = await db.from('fee_invoices').update(patch).eq('stripe_invoice_id', args.stripeInvoiceId);
  if (error) {
    console.error('[fee-invoices] webhook update failed', { code: error.code });
    return false;
  }
  return true;
}
