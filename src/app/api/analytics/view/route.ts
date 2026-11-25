import { NextResponse } from 'next/server';
import { captureServerEvent } from '@/lib/analytics/server';
import {
  distinctIdFromCookieHeader,
  shouldRecordView,
  viewProperties,
} from '@/lib/analytics/view-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * First-party beacon for landing_viewed / settlement_viewed. Used when
 * posthog-js has not initialized yet or is blocked. No PII.
 */
async function handle(req: Request) {
  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const url = new URL(req.url);
  const event = payload.event ?? url.searchParams.get('event');
  const path =
    (typeof payload.path === 'string' && payload.path) || url.searchParams.get('path') || '';
  const slug =
    (typeof payload.slug === 'string' && payload.slug) ||
    (payload.properties && typeof payload.properties === 'object'
      ? String((payload.properties as { slug?: unknown }).slug ?? '')
      : '') ||
    url.searchParams.get('slug') ||
    '';
  const lawsuitId =
    (typeof payload.lawsuit_id === 'string' && payload.lawsuit_id) ||
    (payload.properties && typeof payload.properties === 'object'
      ? String((payload.properties as { lawsuit_id?: unknown }).lawsuit_id ?? '')
      : '');

  const checked = shouldRecordView({
    event,
    userAgent: req.headers.get('user-agent'),
  });
  if (!checked.ok) {
    return NextResponse.json({ ok: true, skipped: checked.reason });
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? '';
  const distinctId =
    distinctIdFromCookieHeader(req.headers.get('cookie'), key) ?? `web:${checked.event}`;

  const properties = viewProperties({
    path: path || undefined,
    slug: slug || undefined,
    lawsuitId: lawsuitId || undefined,
  });

  await captureServerEvent({
    event: checked.event,
    distinctId,
    properties: { ...properties, $lib: 'claimmatch-view-beacon' },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
