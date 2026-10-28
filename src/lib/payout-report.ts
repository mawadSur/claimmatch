import { flags } from '@/lib/flags';
import { recordMatchEvent, upsertMatchLabel } from '@/lib/match-events';
import { createServiceClient } from '@/lib/supabase/server';

export const PAYOUT_METHODS = ['check', 'card', 'e_payment', 'other'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_AMOUNT_MIN = 0;
export const PAYOUT_AMOUNT_MAX = 100_000;

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === 'string' && (PAYOUT_METHODS as readonly string[]).includes(value);
}

/** USD amount only. 0–100000 inclusive, or null when omitted. Never a fee. */
export function parsePayoutAmount(value: unknown): { ok: true; amount: number | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, amount: null };
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter a dollar amount, or leave it blank.' };
  if (n < PAYOUT_AMOUNT_MIN || n > PAYOUT_AMOUNT_MAX) {
    return { ok: false, error: 'Amount must be between $0 and $100,000.' };
  }
  return { ok: true, amount: Math.round(n * 100) / 100 };
}

export function parsePayoutDate(value: unknown): { ok: true; date: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, date: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Use a date like 2026-10-28.' };
  }
  return { ok: true, date: value };
}

export interface SavePayoutInput {
  userId: string;
  claimId: string;
  lawsuitId: string;
  amount: number | null;
  paidOn: string | null;
  method: PayoutMethod | null;
}

/**
 * Record a user-reported payout. Writes the amount only — fee_pct is 0 so
 * generated fee columns stay 0. Also labels the match as paid.
 */
export async function saveUserPayoutReport(input: SavePayoutInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!flags.payoutReport()) {
    return { ok: false, error: 'Payout reporting is turned off.' };
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const receivedAt = input.paidOn ? `${input.paidOn}T12:00:00.000Z` : now;

  const { data: existing, error: readError } = await svc
    .from('recoveries')
    .select('id')
    .eq('claim_id', input.claimId)
    .maybeSingle();
  if (readError) {
    console.error('[payout] read failed', { code: readError.code });
    return { ok: false, error: 'Could not save that just now.' };
  }

  const row = {
    user_id: input.userId,
    claim_id: input.claimId,
    gross_amount: input.amount ?? 0,
    fee_pct: 0,
    status: 'paid',
    source: 'user_reported',
    payout_method: input.method,
    user_reported_at: now,
    received_at: receivedAt,
    paid_out_at: receivedAt,
  };

  if (existing?.id) {
    const { error } = await svc.from('recoveries').update(row).eq('id', existing.id);
    if (error) {
      console.error('[payout] update failed', { code: error.code });
      return { ok: false, error: 'Could not save that just now.' };
    }
  } else {
    const { error } = await svc.from('recoveries').insert(row);
    if (error) {
      console.error('[payout] insert failed', { code: error.code });
      return { ok: false, error: 'Could not save that just now.' };
    }
  }

  await upsertMatchLabel({
    userId: input.userId,
    lawsuitId: input.lawsuitId,
    label: 'paid',
    payoutAmount: input.amount,
  });
  await recordMatchEvent({
    userId: input.userId,
    lawsuitId: input.lawsuitId,
    eventType: 'user_reported_payout',
    payoutAmount: input.amount,
    consented: true,
  });

  return { ok: true };
}
