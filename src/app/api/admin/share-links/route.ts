import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';
import { sanitizeRef, sanitizeUtm } from '@/lib/attribution';
import { newShareCode, sanitizeDestination, type ShareLinkStats } from '@/lib/share-links';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  label: z.string().trim().max(80).optional(),
  utm_source: z.string().trim().max(80).optional(),
  utm_medium: z.string().trim().max(80).optional(),
  utm_campaign: z.string().trim().max(80).optional(),
  utm_content: z.string().trim().max(80).optional(),
  destination: z.string().trim().max(200).optional(),
  code: z.string().trim().max(32).optional(),
});

async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) return null;
  return admin;
}

/** GET /api/admin/share-links — campaign links with click and signup counts. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  const svc = createServiceClient();
  const { data: links, error } = await svc
    .from('share_links')
    .select('id, code, destination, utm_source, utm_medium, utm_campaign, utm_content, label, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[share-links] list failed', { code: error.code });
    return NextResponse.json({ error: 'Could not load share links.' }, { status: 500 });
  }

  const rows = (links ?? []) as ShareLinkStats[];
  const codes = rows.map((r) => r.code);
  const clicksByCode = new Map<string, number>();
  const signupsByCode = new Map<string, number>();

  if (codes.length > 0) {
    const [{ data: clicks }, { data: signups }] = await Promise.all([
      svc.from('share_link_clicks').select('code').in('code', codes),
      svc.from('profiles').select('first_ref').in('first_ref', codes),
    ]);
    for (const row of (clicks ?? []) as Array<{ code: string }>) {
      clicksByCode.set(row.code, (clicksByCode.get(row.code) ?? 0) + 1);
    }
    for (const row of (signups ?? []) as Array<{ first_ref: string | null }>) {
      if (row.first_ref) signupsByCode.set(row.first_ref, (signupsByCode.get(row.first_ref) ?? 0) + 1);
    }
  }

  const items: ShareLinkStats[] = rows.map((r) => ({
    ...r,
    destination: r.destination || '/',
    clicks: clicksByCode.get(r.code) ?? 0,
    signups: signupsByCode.get(r.code) ?? 0,
  }));

  return NextResponse.json({ links: items });
}

/** POST /api/admin/share-links — create a tracked campaign link. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
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
      { error: parsed.error.issues[0]?.message || 'Check the link details.' },
      { status: 400 },
    );
  }

  const utm_source = sanitizeUtm(parsed.data.utm_source);
  const utm_medium = sanitizeUtm(parsed.data.utm_medium);
  const utm_campaign = sanitizeUtm(parsed.data.utm_campaign);
  const utm_content = sanitizeUtm(parsed.data.utm_content);
  if (!utm_source && !utm_medium && !utm_campaign) {
    return NextResponse.json(
      { error: 'Add at least a source, medium or campaign.' },
      { status: 400 },
    );
  }

  let code = sanitizeRef(parsed.data.code) || newShareCode();
  const destination = sanitizeDestination(parsed.data.destination);
  const label = parsed.data.label?.trim() || null;

  const svc = createServiceClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await svc
      .from('share_links')
      .insert({
        code,
        destination,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        label,
        created_by: admin.id,
      })
      .select('id, code, destination, utm_source, utm_medium, utm_campaign, utm_content, label, created_at')
      .single();
    if (!error && data) {
      return NextResponse.json({
        link: { ...data, clicks: 0, signups: 0 },
      });
    }
    if (error?.code === '23505') {
      if (parsed.data.code) {
        return NextResponse.json({ error: 'That code is already in use.' }, { status: 409 });
      }
      code = newShareCode();
      continue;
    }
    console.error('[share-links] insert failed', { code: error?.code });
    return NextResponse.json({ error: 'Could not create the link.' }, { status: 500 });
  }
  return NextResponse.json({ error: 'Could not create the link.' }, { status: 500 });
}
