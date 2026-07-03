import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/utils';

export const runtime = 'nodejs';

// One-click unsubscribe target for email footers. Token `e` is the recipient's
// email encoded as base64url (see unsubscribeUrl in @/lib/email). We never throw
// here — any bad token or DB hiccup lands the user on a friendly fallback page.

function decodeEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    const email = Buffer.from(token, 'base64url').toString('utf8').trim().toLowerCase();
    // Cheap sanity check so a garbage token doesn't hit the DB.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return email;
  } catch {
    return null;
  }
}

function redirectDone(req: Request, done: 0 | 1): NextResponse {
  const base = SITE.url.replace(/\/$/, '');
  // Prefer the request origin so the redirect works on preview URLs too, but
  // fall back to the configured site URL if the origin can't be resolved.
  let origin = base;
  try {
    origin = new URL(req.url).origin;
  } catch {
    // keep base
  }
  return NextResponse.redirect(`${origin}/unsubscribe?done=${done}`, { status: 303 });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = decodeEmail(url.searchParams.get('e'));
    if (!email) return redirectDone(req, 0);

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('profiles')
      .update({ email_opt_in: false })
      .eq('email', email);

    if (error) {
      console.error('[unsubscribe] update failed:', error);
      return redirectDone(req, 0);
    }
    return redirectDone(req, 1);
  } catch (err) {
    console.error('[unsubscribe] unexpected error:', err);
    return redirectDone(req, 0);
  }
}
