import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import {
  applyHeldClosure,
  asHeldClosures,
  listHeldClosureQueue,
  recordHeldClosureDecision,
} from '@/lib/held-closures';
import { heldChangeFingerprint } from '@/lib/scraper/plan';

export const runtime = 'nodejs';

const SingleSchema = z.object({
  slug: z.string().min(1).max(200),
  action: z.enum(['approve', 'dismiss']),
  fingerprint: z.string().max(4000).optional(),
  changes: z.array(z.string()).optional(),
  patch: z.record(z.unknown()).optional(),
});

const BulkSchema = z.object({
  slugs: z.array(z.string().min(1).max(200)).min(1).max(200),
  action: z.literal('bulk_approve'),
});

/**
 * GET /api/admin/held-closures — list the review queue (flag on).
 * POST — approve (apply that closure only), dismiss, or bulk-approve.
 * Admin session + service role. Never auto-closes.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.adminHeldClosures()) {
    return NextResponse.json({ error: 'Held-closure queue is off.' }, { status: 404 });
  }
  const items = await listHeldClosureQueue();
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.adminHeldClosures()) {
    return NextResponse.json({ error: 'Held-closure queue is off.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const bulk = BulkSchema.safeParse(body);
  if (bulk.success) {
    const queue = await listHeldClosureQueue();
    const bySlug = new Map(queue.map((item) => [item.slug, item]));
    const results: Array<{ slug: string; ok: boolean; error?: string }> = [];
    for (const slug of bulk.data.slugs) {
      const item = bySlug.get(slug);
      const applied = await applyHeldClosure({
        slug,
        adminId: admin.id,
        fingerprint: item?.fingerprint,
        changes: item?.changes ?? [],
        storedPatch: item?.patch ?? null,
      });
      results.push(
        applied.ok ? { slug, ok: true } : { slug, ok: false, error: applied.error },
      );
    }
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      updated: results.filter((r) => r.ok).length,
      results,
    });
  }

  const parsed = SingleSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { slug, action, changes, patch } = parsed.data;
  const fingerprint = parsed.data.fingerprint ?? heldChangeFingerprint(changes ?? []);

  if (action === 'dismiss') {
    const recorded = await recordHeldClosureDecision({
      slug,
      decision: 'dismissed',
      fingerprint,
      adminId: admin.id,
    });
    if (!recorded.ok) {
      return NextResponse.json({ error: recorded.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, slug, action: 'dismissed' });
  }

  const stored = asHeldClosures(
    patch ? [{ source: 'held', slug, changes: changes ?? [], patch }] : [],
  )[0];
  const applied = await applyHeldClosure({
    slug,
    adminId: admin.id,
    fingerprint,
    changes: changes ?? [],
    storedPatch: stored?.patch ?? patch ?? null,
  });
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error }, { status: applied.status ?? 400 });
  }
  return NextResponse.json({ ok: true, slug, action: 'approved', lawsuitId: applied.lawsuitId });
}
