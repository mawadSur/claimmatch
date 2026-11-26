import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { authorizeCron } from '@/lib/cron-auth';
import { revalidateCatalog } from '@/lib/catalog-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) return null;
  return slug;
}

/**
 * POST /api/admin/revalidate-catalog
 *
 * Bust ISR for catalog pages after an admin or owner-apply SQL change to
 * claim_action / status. Auth: a signed-in admin session, or the same
 * `Authorization: Bearer ${CRON_SECRET}` header Vercel Cron uses.
 *
 * Body: `{ "slug": "optional-settlement-slug" }`. Omit slug to bust the
 * home and list pages.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin && !authorizeCron(req)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let slug: string | null = null;
  try {
    const body = (await req.json()) as { slug?: unknown };
    slug = slugOf(body.slug);
  } catch {
    slug = null;
  }

  const paths = revalidateCatalog(slug);
  return NextResponse.json({ ok: true, paths });
}
