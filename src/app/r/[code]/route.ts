import { NextResponse } from 'next/server';
import {
  attributionSetCookies,
  parseAttribution,
  sanitizeRef,
} from '@/lib/attribution';
import { resolveShareRedirect, type ShareLinkRecord } from '@/lib/share-links';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * GET /r/:code — campaign short link or personal referral.
 * Logs the click, sets first-touch cookies, and redirects with UTMs + ref
 * so signup attribution still has them after the hop.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const url = new URL(req.url);
  const incoming = parseAttribution(url.searchParams);
  const origin = url.origin;

  let shareLink: ShareLinkRecord | null = null;
  let isPersonalReferral = false;
  const code = sanitizeRef(raw);

  if (code && isSupabaseConfigured()) {
    try {
      const svc = createServiceClient();
      const [{ data: link }, { data: profile }] = await Promise.all([
        svc
          .from('share_links')
          .select('code, destination, utm_source, utm_medium, utm_campaign, utm_content, label')
          .eq('code', code)
          .maybeSingle(),
        svc.from('profiles').select('id').eq('referral_code', code).maybeSingle(),
      ]);
      if (link) shareLink = link as ShareLinkRecord;
      isPersonalReferral = Boolean(profile?.id);
    } catch {
      // Still redirect with whatever we have so a DB blip does not drop UTMs.
    }
  }

  const resolved = resolveShareRedirect({
    code: code || raw || '',
    origin,
    incoming,
    shareLink,
    isPersonalReferral,
  });

  if (!resolved) {
    return NextResponse.redirect(new URL('/signup', origin));
  }

  if (resolved.logClick && isSupabaseConfigured()) {
    try {
      await createServiceClient().from('share_link_clicks').insert({ code: code || raw });
    } catch {
      // Click count is best-effort; the visitor still goes through.
    }
  }

  const res = NextResponse.redirect(resolved.url);
  const secure = url.protocol === 'https:';
  for (const cookie of attributionSetCookies(resolved.attribution, secure)) {
    res.headers.append('Set-Cookie', cookie);
  }
  return res;
}
