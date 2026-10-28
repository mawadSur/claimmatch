import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import {
  isPayoutMethod,
  parsePayoutAmount,
  parsePayoutDate,
  saveUserPayoutReport,
} from '@/lib/payout-report';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payouts — the user said they were paid. Records the amount only.
 * No fee is calculated, shown or charged.
 */
export async function POST(req: Request) {
  if (!flags.payoutReport()) {
    return NextResponse.json({ error: 'Payout reporting is turned off.' }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const rec = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  const claimId = typeof rec.claim_id === 'string' ? rec.claim_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) {
    return NextResponse.json({ error: 'A claim is required.' }, { status: 400 });
  }

  const amount = parsePayoutAmount(rec.amount);
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });
  const paidOn = parsePayoutDate(rec.paid_on);
  if (!paidOn.ok) return NextResponse.json({ error: paidOn.error }, { status: 400 });
  if (rec.method != null && rec.method !== '' && !isPayoutMethod(rec.method)) {
    return NextResponse.json({ error: 'Choose check, card, e-payment, or other.' }, { status: 400 });
  }

  const { data: claim, error } = await supabase
    .from('claims')
    .select('id, lawsuit_id, status, confirmation_number')
    .eq('id', claimId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !claim) {
    return NextResponse.json({ error: 'We could not find that claim.' }, { status: 404 });
  }
  const status = String((claim as { status?: string }).status ?? '');
  const submitted =
    status === 'submitted' ||
    status === 'reported_filed' ||
    status === 'paid' ||
    Boolean((claim as { confirmation_number?: string | null }).confirmation_number);
  if (!submitted) {
    return NextResponse.json({ error: 'Tell us you filed before recording a payout.' }, { status: 400 });
  }

  const saved = await saveUserPayoutReport({
    userId: user.id,
    claimId,
    lawsuitId: (claim as { lawsuit_id: string }).lawsuit_id,
    amount: amount.amount,
    paidOn: paidOn.date,
    method: isPayoutMethod(rec.method) ? rec.method : null,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
