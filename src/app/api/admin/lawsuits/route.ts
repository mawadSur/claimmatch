import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Fields an admin may mutate via an 'update' action. Anything else in the patch
// is ignored — never trust the client to name arbitrary columns.
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
  'proof_required',
  'is_featured',
  'review_status',
]);

const SingleBodySchema = z.object({
  id: z.string().uuid('A valid settlement id is required.'),
  action: z.enum(['publish', 'reject', 'update']),
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
 *   update  → apply a whitelisted patch
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

  let updates: Record<string, unknown>;
  if (action === 'publish') {
    updates = { review_status: 'published', reviewed_by: admin.id, reviewed_at: now };
  } else if (action === 'reject') {
    updates = { review_status: 'rejected', reviewed_by: admin.id, reviewed_at: now };
  } else {
    // action === 'update' — keep only whitelisted keys.
    const patch = parsed.data.patch ?? {};
    updates = {};
    for (const [key, value] of Object.entries(patch)) {
      if (ALLOWED_KEYS.has(key)) updates[key] = value;
    }
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
    .select('id');

  if (error) {
    console.error('[admin/lawsuits] bulk update failed:', error);
    return NextResponse.json(
      { error: 'Could not update the settlements.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    updated: updated?.length ?? 0,
    ids: updated?.map((l: { id: string }) => l.id) ?? [],
  });
}
