import { z } from 'zod';
import { createFeeInvoice } from '@/lib/fee-invoices';
import { UuidSchema } from '@/lib/filing/v2/contract';
import { canInvoiceFees, recordStaffAccess } from '@/lib/staff-roles';
import { fail, guard, readBody, reply } from '../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    claim_id: UuidSchema,
    payout_amount_cents: z.number().int().positive(),
    days_until_due: z.union([z.literal(14), z.literal(30)]).default(14),
  })
  .strict();

/** POST /api/admin/filing/fee-invoices : admin records a payout and sends a recovery-only Stripe invoice. */
export async function POST(req: Request) {
  const auth = await guard(req, canInvoiceFees);
  if (!auth.ok) return auth.res;
  const body = await readBody(req, BodySchema);
  if (!body.ok) return body.res;
  const result = await createFeeInvoice({
    claimId: body.data.claim_id,
    payoutAmountCents: body.data.payout_amount_cents,
    daysUntilDue: body.data.days_until_due,
    actorId: auth.staff.id,
  });
  if (!result.ok) {
    if (result.code === 'stripe_not_configured') {
      return reply({ error: result.error, code: 'service_unavailable' }, 503);
    }
    if (result.code === 'not_found') return fail('not_found');
    if (result.code === 'conflict') return fail('invalid_transition');
    if (result.code === 'invalid_request') {
      return fail('invalid_request', { fields: [{ path: '', message: result.error }] });
    }
    return fail('service_unavailable');
  }
  await recordStaffAccess({
    staff: auth.staff,
    action: 'create_fee_invoice',
    claimId: result.invoice.claim_id,
    subjectUserId: result.invoice.user_id,
    targetTable: 'fee_invoices',
    targetId: result.invoice.id,
    detail: {
      payout_amount_cents: result.invoice.payout_amount_cents,
      fee_amount_cents: result.invoice.fee_amount_cents,
    },
    req,
  });
  return reply({ invoice: result.invoice });
}
