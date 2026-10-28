import { NextResponse, type NextRequest } from 'next/server';
import {
  confirmDestination,
  confirmFailure,
  parseConfirmType,
  parseTokenHash,
} from '@/lib/auth-confirm';
import { PENDING_NEXT_COOKIE } from '@/lib/safe-next';
import { applySessionFlags } from '@/lib/session-flags';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /auth/confirm/verify — uses the one-time email token (only on a real
 * button press, never on a GET, so link scanners can't use it up), starts the
 * session, and redirects (303) to onboarding or the reset-password page.
 */
export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(`${origin}${confirmFailure(null)}`, 303);
  }
  const tokenHash = parseTokenHash(form.get('token_hash'));
  const type = parseConfirmType(form.get('type'));
  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}${confirmFailure(type)}`, 303);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return NextResponse.redirect(`${origin}${confirmFailure(type)}`, 303);
  }
  if (data?.user) {
    await applySessionFlags({ userId: data.user.id, email: data.user.email });
  }

  const target = confirmDestination(
    type,
    form.get('next'),
    request.cookies.get(PENDING_NEXT_COOKIE)?.value,
  );
  const response = NextResponse.redirect(`${origin}${target}`, 303);
  if (type !== 'recovery') response.cookies.delete(PENDING_NEXT_COOKIE);
  return response;
}
