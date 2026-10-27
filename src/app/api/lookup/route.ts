import { NextResponse } from 'next/server';
import { flags } from '@/lib/flags';
import { cleanSearchTerm, lookupPublishedLawsuits, officialLinkFor } from '@/lib/lawsuits';
import { NOTICE_NOT_FOUND, rankNoticeMatches } from '@/lib/notice-lookup';
import { ipKey, rateLimit } from '@/lib/ratelimit';
import { showVerifiedBadge } from '@/lib/verified-fields';
import { formatDeadline } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/lookup?q= — catalog matches for a pasted notice.
 * Flagged off (404). Rate limited. Does not store the query.
 */
export async function GET(req: Request) {
  if (!flags.noticeLookup()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const limited = rateLimit(`lookup:${ipKey(req)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many lookups. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  const term = cleanSearchTerm(new URL(req.url).searchParams.get('q'));
  if (!term) {
    return NextResponse.json({ query: '', matches: [], message: null });
  }

  const catalog = await lookupPublishedLawsuits();
  if (catalog.error) {
    return NextResponse.json({ error: 'Could not search the catalog.' }, { status: 503 });
  }

  const matches = rankNoticeMatches(term, catalog.lawsuits).map((lawsuit) => {
    const official = officialLinkFor(lawsuit);
    return {
      slug: lawsuit.slug,
      title: lawsuit.title,
      deadline: lawsuit.deadline ? formatDeadline(lawsuit.deadline) : null,
      official:
        official?.kind === 'official'
          ? { href: official.href, host: official.host }
          : null,
      verified: showVerifiedBadge(lawsuit),
    };
  });

  return NextResponse.json({
    query: term,
    matches,
    message: matches.length === 0 ? NOTICE_NOT_FOUND : null,
  });
}
