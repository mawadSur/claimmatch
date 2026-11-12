import { NextResponse } from 'next/server';
import { classifyTrafficChannel } from '@/lib/analytics/referrer-channel';
import { parseAttribution, hasAttribution, sanitizeReferrer, type Attribution } from '@/lib/attribution';
import { flags } from '@/lib/flags';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function attributionFromBody(body: unknown): Attribution {
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, string | null | undefined>)
      : {};
  const parsed = parseAttribution(record);
  return {
    ...parsed,
    referrer: parsed.referrer || sanitizeReferrer(record.referrer),
  };
}

/**
 * POST /api/attribution — persist first-touch UTMs + ref on the signed-in
 * profile. No-op (and 401) when signed out. The SQL function only fills blanks.
 * When AI_REFERRER_ATTRIBUTION_ENABLED=1, also stores the closed-set channel.
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

  const attr = attributionFromBody(body);
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

  if (flags.aiReferrerAttribution()) {
    const channel = classifyTrafficChannel({
      utmSource: attr.utm_source,
      utmMedium: attr.utm_medium,
      referrer: attr.referrer,
    });
    if (channel) {
      const channelError = await supabase.rpc('persist_first_traffic_channel', {
        p_channel: channel,
      });
      if (channelError.error) {
        console.error('[attribution] channel persist failed', { code: channelError.error.code });
      }
    }
  }

  await applySessionFlags({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
