import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '@/lib/email-transactional';
import { guestMatchShareUrl, parseGuestMatchEmail, renderGuestMatchEmail } from '@/lib/guest-match-email';
import { isJsonRequest } from '@/lib/json-request';
import { isOpenForClaims, lookupLawsuits } from '@/lib/lawsuits';
import { parseMatchPreviewDraft, previewMatchesForScope } from '@/lib/match-preview';
import { ipKey, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

/**
 * POST /api/match-preview/email — one-shot transactional email of guest match
 * results. Re-runs the match on the server. Does not create a subscriber or
 * marketing opt-in.
 */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return reply({ error: 'Send the request as JSON.' }, 415);

  const ipLimited = rateLimit(`guest-match-email-ip:${ipKey(req)}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!ipLimited.ok) {
    return reply(
      { error: 'Too many emails from this network. Try again later.' },
      429,
      { 'Retry-After': String(ipLimited.retryAfter) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Invalid request.' }, 400);
  }
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const email = parseGuestMatchEmail(input.email);
  if (!email) return reply({ error: 'Enter a valid email address.' }, 400);

  const emailLimited = rateLimit(`guest-match-email:${email}`, {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!emailLimited.ok) {
    return reply(
      { error: 'Too many emails to that address. Try again later.' },
      429,
      { 'Retry-After': String(emailLimited.retryAfter) },
    );
  }

  const draft = parseMatchPreviewDraft(input);
  if (!draft) return reply({ error: 'Answer the questions and try again.' }, 400);

  const catalog = await lookupLawsuits();
  if (catalog.error) {
    return reply({ error: 'We couldn’t load settlements right now. Please try again in a few minutes.' }, 503);
  }

  const open = catalog.lawsuits.filter((lawsuit) => isOpenForClaims(lawsuit));
  const matches = previewMatchesForScope(open, draft, null);
  if (matches.length === 0) {
    return reply({ error: 'There are no results to email for these answers.' }, 400);
  }

  const shareUrl = guestMatchShareUrl(draft);
  const mail = renderGuestMatchEmail({ matches, shareUrl });
  const sent = await sendTransactionalEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: `guest-match:${email}:${shareUrl}`,
  });
  if (sent.status === 'not_configured') {
    return reply({ error: 'Email is not configured on this environment.' }, 503);
  }
  if (sent.status === 'failed') {
    return reply({ error: 'We could not send that email. Try copying the link instead.' }, 502);
  }
  return reply({ ok: true, matchCount: matches.length });
}
