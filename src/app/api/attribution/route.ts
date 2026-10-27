import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAttribution, hasAttribution } from '@/lib/attribution';

export const runtime = 'nodejs';

/**
 * POST /api/attribution — persist first-touch UTMs + ref on the signed-in
 * profile. No-op (and 401) when signed out. The SQL function only fills blanks.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const attr = parseAttribution(
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, string | null | undefined>)
      : {},
  );
  if (!hasAttribution(attr)) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.rpc('persist_first_attribution', {
    p_utm_source: attr.utm_source,
    p_utm_medium: attr.utm_medium,
    p_utm_campaign: attr.utm_campaign,
    p_utm_content: attr.utm_content,
    p_ref: attr.ref,
  });
  if (error) {
    console.error('[attribution] persist failed', { code: error.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
