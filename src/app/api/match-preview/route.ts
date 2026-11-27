import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { isOpenForClaims, lookupLawsuits } from '@/lib/lawsuits';
import {
  parseMatchPreviewDraft,
  parseSettlementScopeSlug,
  previewCookie,
  previewMatchesForScope,
} from '@/lib/match-preview';
import { ipKey, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/match-preview — logged-out match results from preview answers.
 * Returns match count-safe fields only (no scores as percentages, no "you
 * qualify"). Nothing is written to the database; the validated answers are
 * mirrored into the short-lived `cm_preview` cookie so /onboarding can still
 * prefill them when the confirmation email is opened in another browser, where
 * localStorage is gone.
 */
export async function POST(req: Request) {
  const limited = rateLimit(`match-preview:${ipKey(req)}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many previews. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const draft = parseMatchPreviewDraft(body);
  const settlement =
    body && typeof body === 'object' && !Array.isArray(body)
      ? parseSettlementScopeSlug((body as { settlement?: unknown }).settlement)
      : null;
  if (!draft) {
    return NextResponse.json({ error: 'Answer the questions and try again.' }, { status: 400 });
  }

  const catalog = await lookupLawsuits();
  if (catalog.error) {
    return NextResponse.json(
      { error: 'We couldn’t load settlements right now. Please try again in a few minutes.' },
      { status: 503 },
    );
  }

  const open = catalog.lawsuits.filter((lawsuit) => isOpenForClaims(lawsuit));
  // Both wave-A lanes changed this call: the no-PIN/breach ordering option
  // (fix 10) and the server-side preview cookie that survives the sign-up
  // redirect (fix 13a). Keep both.
  const matches = previewMatchesForScope(open, draft, settlement, new Date(), {
    noPinBreachFirst: flags.noPinBreachPriority(),
  });
  const res = NextResponse.json({ matches });
  res.headers.append('Set-Cookie', previewCookie(draft, isHttps(req)));
  return res;
}

/** https behind the proxy, or https directly, so Secure is set in production. */
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim().toLowerCase() === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}
