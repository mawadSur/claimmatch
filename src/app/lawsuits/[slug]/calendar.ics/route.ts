import { NextResponse } from 'next/server';
import { buildDeadlineIcs, deadlineIcsDate } from '@/lib/calendar-ics';
import { flags } from '@/lib/flags';
import { lookupLawsuitBySlug, officialLinkFor } from '@/lib/lawsuits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /lawsuits/:slug/calendar.ics — all-day claim-deadline event.
 * Off unless CALENDAR_ICS_ENABLED=1. 404 when the listing has no deadline.
 */
export async function GET(_req: Request, { params }: Params) {
  if (!flags.calendarIcs()) {
    return new NextResponse(null, { status: 404 });
  }

  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  if (result.status === 'error') {
    return new NextResponse(null, { status: 500 });
  }
  if (result.status === 'missing') {
    return new NextResponse(null, { status: 404 });
  }

  const lawsuit = result.lawsuit;
  if (!deadlineIcsDate(lawsuit.deadline)) {
    return new NextResponse(null, { status: 404 });
  }

  const official = officialLinkFor(lawsuit);
  const ics = buildDeadlineIcs({
    title: lawsuit.title,
    deadline: lawsuit.deadline as string,
    officialUrl: official?.href ?? null,
    uid: `claimmatch-deadline-${lawsuit.slug}@claimmatch`,
  });
  if (!ics) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${lawsuit.slug}-deadline.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
