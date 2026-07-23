import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CATEGORY = z.enum([
  'claims_service',
  'law_firm',
  'financial',
  'tax',
  'credit',
  'general',
]);
const PAYOUT = z.enum(['per_lead', 'per_conversion', 'hybrid']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CreateSchema = z.object({
  slug: z.string().trim().regex(SLUG_RE, 'Slug must be lowercase words separated by hyphens.'),
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url('A valid destination URL is required.'),
  category: CATEGORY.default('general'),
  payout_model: PAYOUT.default('per_lead'),
  lead_fee_cents: z.number().int().min(0).max(1_000_000).default(0),
  conversion_fee_cents: z.number().int().min(0).max(10_000_000).default(0),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  disclosure: z.string().trim().max(400).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

const UpdateSchema = z.object({
  id: z.string().uuid('A valid partner id is required.'),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  lead_fee_cents: z.number().int().min(0).max(1_000_000).optional(),
  conversion_fee_cents: z.number().int().min(0).max(10_000_000).optional(),
  category: CATEGORY.optional(),
  payout_model: PAYOUT.optional(),
  name: z.string().trim().min(2).max(120).optional(),
  url: z.string().trim().url().optional(),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  disclosure: z.string().trim().max(400).optional(),
});

async function requireAdmin() {
  return getAdminUser();
}

/** POST /api/admin/partners — create a partner. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input.' },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('partners')
    .insert(parsed.data)
    .select('*')
    .single();

  if (error) {
    console.error('[admin/partners] create failed:', error);
    const msg =
      error.code === '23505'
        ? 'A partner with that slug already exists.'
        : 'Could not create the partner.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, partner: data });
}

/** PATCH /api/admin/partners — update a partner (toggle active, edit fees, etc.). */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input.' },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('partners')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[admin/partners] update failed:', error);
    return NextResponse.json({ error: 'Could not update the partner.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, partner: data });
}
