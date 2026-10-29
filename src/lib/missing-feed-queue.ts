import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import { missingFeedCloseAfterFromEnv } from '@/lib/scraper/stale';

export interface MissingFeedCandidate {
  id: string;
  slug: string;
  title: string;
  deadline: string | null;
  missed_feed_count: number;
  last_seen_at: string | null;
  external_id: string | null;
}

export function missingFeedCloseThreshold(): number {
  return missingFeedCloseAfterFromEnv(process.env.INGEST_MISSING_FEED_CLOSE_AFTER);
}

/** True when an open row has missed N successful feeds and should be reviewed. */
export function shouldProposeMissingClose(
  row: Pick<MissingFeedCandidate, 'missed_feed_count'>,
  closeAfter: number = missingFeedCloseThreshold(),
): boolean {
  return (row.missed_feed_count ?? 0) >= closeAfter;
}

export function closeMissingFeedPatch(): { status: 'closed' } {
  return { status: 'closed' };
}

/** Keep the row open; reset the miss clock so it needs N new misses. */
export function keepMissingFeedPatch(): { missed_feed_count: 0 } {
  return { missed_feed_count: 0 };
}

/**
 * Open SettleSignal rows at or past the miss threshold. Empty when the
 * queue flag is off. Uses existing last_seen_at / missed_feed_count —
 * no new table.
 */
export async function listMissingFeedCloseQueue(
  opts: { closeAfter?: number; limit?: number } = {},
): Promise<MissingFeedCandidate[]> {
  if (!flags.missingCloseQueue()) return [];
  const closeAfter = opts.closeAfter ?? missingFeedCloseThreshold();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('lawsuits')
    .select('id, slug, title, deadline, missed_feed_count, last_seen_at, external_id')
    .in('status', ['open', 'closing_soon'])
    .gte('missed_feed_count', closeAfter)
    .like('external_id', 'settlesignal:%')
    .order('missed_feed_count', { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) {
    console.error('[missing-feed-queue] list failed:', error.message);
    return [];
  }
  return ((data ?? []) as MissingFeedCandidate[]).filter((row) =>
    shouldProposeMissingClose(row, closeAfter),
  );
}
