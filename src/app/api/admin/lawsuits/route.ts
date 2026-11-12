import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { notifyIndexNowBestEffort, shouldNotifyIndexNowForAdminAction } from '@/lib/indexnow';
import { closeMissingFeedPatch, keepMissingFeedPatch } from '@/lib/missing-feed-queue';
import { createServiceClient } from '@/lib/supabase/server';
import { isThirdPartyFeeStatus } from '@/lib/third-party-fee';
import { isProofVerified } from '@/lib/verified-fields';

export const runtime = 'nodejs';

// Fields an admin may mutate via an 'update' action. Anything else in the patch
// is ignored — never trust the client to name arbitrary columns.
// verified_at / verified_by are set only by the 'verify' / 'unverify' actions.
const ALLOWED_KEYS = new Set([
  'title',
  'summary',
  'description',
  'category',
  'administrator',
  'typical_payout',
  'deadline',
  'eligibility',
  'eligibility_text',
  'eligibility_verified',
  'proof_verified',
  'form_field_order',
  'proof_required',
  'is_featured',
  'review_status',
  'assisted_filing_allowed',
  'third_party_fee_status',
  'final_approval_hearing_at',
  'payment_timing_text',
]);

const SingleAction = z.enum([
  'publish',
  'reject',
  'update',
  'verify',
  'unverify',
  'close_missing',
  'keep_missing',
]);

const SingleBodySchema = z.object({
  id: z.string().uuid('A valid settlement id is required.'),
  action: SingleAction,
  patch: z.record(z.unknown()).optional(),
});

const BulkBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one settlement id is required.'),
  action: z.enum(['bulk_publish', 'bulk_reject']),
});

/**
 * PATCH /api/admin/lawsuits — admin-only moderation of the settlement catalog.
 *   publish → review_status='published' (+ reviewer stamp)
 *   reject  → review_status='rejected'  (+ reviewer stamp)
 *   update  → apply a whitelisted patch (cannot set verified_at / verified_by)
 *   verify  → stamp verified_at / verified_by; optional verified-field patch
 *   unverify → clear the stamp (fields stay)
 *   bulk_publish → publish multiple settlements at once
 *   bulk_reject  → reject multiple settlements at once
 * Writes go through the service client (bypasses RLS) but are gated by an admin
 * check first.
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

  // Check if this is a bulk action
  const bulkParsed = BulkBodySchema.safeParse(body);
  if (bulkParsed.success) {
    return handleBulkAction(bulkParsed.data, admin);
  }

  const parsed = SingleBodySchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { id, action } = parsed.data;
  const now = new Date().toISOString();

  if (action === 'close_missing' || action === 'keep_missing') {
    if (!flags.missingCloseQueue()) {
      return NextResponse.json({ error: 'Missing-feed close queue is off.' }, { status: 400 });
    }
  }

  let updates: Record<string, unknown>;
  if (action === 'publish') {
    updates = { review_status: 'published', reviewed_by: admin.id, reviewed_at: now };
  } else if (action === 'reject') {
    updates = { review_status: 'rejected', reviewed_by: admin.id, reviewed_at: now };
  } else if (action === 'verify') {
    const fieldPatch = pickVerifiedPatch(parsed.data.patch ?? {});
    if (fieldPatch.error) {
      return NextResponse.json({ error: fieldPatch.error }, { status: 400 });
    }
    updates = {
      ...fieldPatch.updates,
      verified_at: now,
      verified_by: admin.id,
    };
  } else if (action === 'unverify') {
    updates = { verified_at: null, verified_by: null };
  } else if (action === 'close_missing') {
    updates = closeMissingFeedPatch();
  } else if (action === 'keep_missing') {
    updates = keepMissingFeedPatch();
  } else {
    // action === 'update' — keep only whitelisted keys. Never stamp verification.
    const patch = parsed.data.patch ?? {};
    const fieldPatch = pickAllowedPatch(patch);
    if (fieldPatch.error) {
      return NextResponse.json({ error: fieldPatch.error }, { status: 400 });
    }
    updates = fieldPatch.updates;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided.' },
        { status: 400 },
      );
    }
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('lawsuits')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[admin/lawsuits] update failed:', error);
    return NextResponse.json(
      { error: 'Could not update the settlement.' },
      { status: 400 },
    );
  }

  if (shouldNotifyIndexNowForAdminAction(action)) {
    const slug = data && typeof data === 'object' && typeof (data as { slug?: unknown }).slug === 'string'
      ? (data as { slug: string }).slug
      : null;
    if (slug) {
      void notifyIndexNowBestEffort([slug]);
    }
  }

  return NextResponse.json({ ok: true, lawsuit: data });
}

async function handleBulkAction(
  data: z.infer<typeof BulkBodySchema>,
  admin: { id: string; email: string | null },
) {
  const { ids, action } = data;
  const now = new Date().toISOString();
  const svc = createServiceClient();

  const reviewStatus = action === 'bulk_publish' ? 'published' : 'rejected';
  const updates = {
    review_status: reviewStatus,
    reviewed_by: admin.id,
    reviewed_at: now,
  };

  const { data: updated, error } = await svc
    .from('lawsuits')
    .update(updates)
    .in('id', ids)
    .select('id, slug');

  if (error) {
    console.error('[admin/lawsuits] bulk update failed:', error);
    return NextResponse.json(
      { error: 'Could not update the settlements.' },
      { status: 400 },
    );
  }

  if (shouldNotifyIndexNowForAdminAction(action)) {
    const slugs = ((updated ?? []) as { slug?: string | null }[])
      .map((row) => row.slug)
      .filter((value): value is string => Boolean(value));
    if (slugs.length > 0) {
      void notifyIndexNowBestEffort(slugs);
    }
  }

  return NextResponse.json({
    ok: true,
    updated: updated?.length ?? 0,
    ids: updated?.map((l: { id: string }) => l.id) ?? [],
  });
}

const VERIFIED_PATCH_KEYS = new Set([
  'eligibility_verified',
  'proof_verified',
  'administrator',
  'form_field_order',
  'final_approval_hearing_at',
  'payment_timing_text',
]);

function pickAllowedPatch(
  patch: Record<string, unknown>,
): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key === 'proof_verified') {
      const checked = normalizeProofVerified(value);
      if (!checked.ok) return { updates: {}, error: checked.error };
      updates[key] = checked.value;
      continue;
    }
    if (key === 'form_field_order') {
      const checked = normalizeFieldOrder(value);
      if (!checked.ok) return { updates: {}, error: checked.error };
      updates[key] = checked.value;
      continue;
    }
    if (key === 'eligibility_verified') {
      updates[key] = typeof value === 'string' ? value : value == null ? null : String(value);
      continue;
    }
    if (key === 'assisted_filing_allowed') {
      updates[key] = value === true;
      continue;
    }
    if (key === 'third_party_fee_status') {
      if (!isThirdPartyFeeStatus(value)) {
        return { updates: {}, error: 'Fee status must be unknown, allowed, or barred.' };
      }
      updates[key] = value;
      continue;
    }
    if (key === 'final_approval_hearing_at') {
      const checked = normalizeHearingDate(value);
      if (!checked.ok) return { updates: {}, error: checked.error };
      updates[key] = checked.value;
      continue;
    }
    if (key === 'payment_timing_text') {
      const checked = normalizePaymentTiming(value);
      if (!checked.ok) return { updates: {}, error: checked.error };
      updates[key] = checked.value;
      continue;
    }
    updates[key] = value;
  }
  return { updates };
}

function pickVerifiedPatch(
  patch: Record<string, unknown>,
): { updates: Record<string, unknown>; error?: string } {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (VERIFIED_PATCH_KEYS.has(key)) filtered[key] = value;
  }
  return pickAllowedPatch(filtered);
}

function normalizeProofVerified(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  if (!isProofVerified(value)) {
    return { ok: false, error: 'Proof must be yes, no, optional, or unknown.' };
  }
  return { ok: true, value };
}

function normalizeFieldOrder(
  value: unknown,
): { ok: true; value: string[] | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return { ok: false, error: 'form_field_order must be a list of field names.' };
  }
  return { ok: true, value };
}

function normalizeHearingDate(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Hearing date must be YYYY-MM-DD, or blank if not announced.' };
  }
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return { ok: false, error: 'Hearing date must be a real calendar day.' };
  }
  return { ok: true, value };
}

function normalizePaymentTiming(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: 'Payment timing must be text, or blank if not announced.' };
  }
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > 280) {
    return { ok: false, error: 'Payment timing must be 280 characters or fewer.' };
  }
  return { ok: true, value: text };
}
