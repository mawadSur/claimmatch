import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { todayISO } from './utils';
import { fetchSettleSignalOpenSet } from '@/lib/scraper/sources/settlesignal';

export type CloseJobResult = {
  closedByDeadline: number;
  closedByFeed: number;
  feedReconcileSkipped?: string;
};

/**
 * Daily close job (UTC calendar dates — see todayISO).
 * 1. Mark past-deadline rows closed.
 * 2. After a successful SettleSignal fetch, close source rows no longer in the
 *    "Open for claims" set. Skip if the fetch fails or the open count drops
 *    more than 50% versus currently-open SettleSignal rows.
 */
export async function runCloseJob(): Promise<CloseJobResult> {
  const result: CloseJobResult = { closedByDeadline: 0, closedByFeed: 0 };
  if (!isSupabaseConfigured()) return result;

  const supabase = createServiceClient();
  const today = todayISO();

  const { data: expired, error: deadlineErr } = await supabase
    .from('lawsuits')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .lt('deadline', today)
    .neq('status', 'closed')
    .select('id');
  if (deadlineErr) {
    console.error('[close-job] deadline close failed:', deadlineErr);
  } else {
    result.closedByDeadline = expired?.length ?? 0;
  }

  const feed = await fetchSettleSignalOpenSet();
  if (!feed.ok) {
    result.feedReconcileSkipped = feed.reason;
    console.warn('[close-job] feed reconcile skipped:', feed.reason);
    return result;
  }

  const { data: currentOpen, error: openErr } = await supabase
    .from('lawsuits')
    .select('id, external_id')
    .like('external_id', 'settlesignal:%')
    .neq('status', 'closed');
  if (openErr) {
    result.feedReconcileSkipped = openErr.message;
    return result;
  }

  const openRows = (currentOpen ?? []) as { id: string; external_id: string }[];
  if (openRows.length > 0 && feed.count < openRows.length * 0.5) {
    result.feedReconcileSkipped = `open count dropped more than 50% (${feed.count} vs ${openRows.length})`;
    console.warn('[close-job]', result.feedReconcileSkipped);
    return result;
  }

  const keep = new Set(feed.externalIds);
  const toClose = openRows.filter((r) => r.external_id && !keep.has(r.external_id));
  if (toClose.length === 0) return result;

  const { data: closed, error: feedErr } = await supabase
    .from('lawsuits')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .in(
      'id',
      toClose.map((r) => r.id),
    )
    .select('id');
  if (feedErr) {
    console.error('[close-job] feed close failed:', feedErr);
  } else {
    result.closedByFeed = closed?.length ?? 0;
  }

  return result;
}
