import { NextResponse, type NextRequest } from 'next/server';
import {
  confirmDestination,
  confirmFailure,
  parseAuthCode,
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
  const code = parseAuthCode(form.get('code'));
  // A code link without a type is a sign-up/email link; recovery links carry
  // ?type=recovery from ForgotPasswordForm's redirectTo.
  const type = parseConfirmType(form.get('type')) ?? (code ? 'email' : null);
  if ((!tokenHash && !code) || !type) {
    return NextResponse.redirect(`${origin}${confirmFailure(type)}`, 303);
  }

  const supabase = await createClient();
  // token_hash: custom email template ({{ .TokenHash }}). code: Supabase's
  // default template, which verifies on Supabase and redirects with a PKCE
  // code; the code verifier cookie from the requesting browser comes with
  // this same-origin POST.
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : await supabase.auth.exchangeCodeForSession(code as string);
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
