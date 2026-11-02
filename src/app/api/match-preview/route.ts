import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { isOpenForClaims, lookupLawsuits } from '@/lib/lawsuits';
import { parseMatchPreviewDraft, previewMatchesFor } from '@/lib/match-preview';
import { ipKey, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/match-preview — logged-out match results from preview answers.
 * Flagged off (404). Does not store answers. Returns match count-safe fields
 * only (no scores as percentages, no "you qualify").
 */
export async function POST(req: Request) {
  if (!flags.matchPreview()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

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
  const matches = previewMatchesFor(open, draft);
  return NextResponse.json({ matches });
}
