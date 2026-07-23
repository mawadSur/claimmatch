import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    id: z.string().uuid('A valid recovery id is required.'),
    action: z.enum(['record', 'mark_paid', 'deny']),
    // Only meaningful for 'record'. net_amount is a DB-generated column equal to
    // gross_amount (ClaimMatch takes no cut) — the client never sets it.
    gross_amount: z.number().finite().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'record' && val.gross_amount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gross_amount'],
        message: 'A gross amount is required to record a recovery.',
      });
    }
  });

/**
 * PATCH /api/admin/recoveries — admin-only recovery lifecycle actions.
 *   record    → set gross_amount, move to 'awaiting_payout', stamp received_at
 *   mark_paid → mark 'paid', stamp paid_out_at
 *   deny      → mark 'denied'
 *
 * net_amount is a GENERATED column equal to gross_amount (ClaimMatch takes no
 * cut) — we never write it; recording the gross recomputes it, and returning '*'
 * echoes the fresh value back for an optimistic UI update. Writes use the service
 * client (bypasses RLS) but are gated behind an admin check first.
 */
export async function PATCH(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { id, action, gross_amount } = parsed.data;
  const now = new Date().toISOString();

  let updates: Record<string, unknown>;
  if (action === 'record') {
    updates = {
      gross_amount,
      status: 'awaiting_payout',
      received_at: now,
    };
  } else if (action === 'mark_paid') {
    updates = { status: 'paid', paid_out_at: now };
  } else {
    updates = { status: 'denied' };
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('recoveries')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[admin/recoveries] update failed:', error);
    return NextResponse.json(
      { error: 'Could not update the recovery.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, recovery: data });
}
