/**
 * Server only: the dashboard's one-click data (the member's filing statuses
 * and the lanes of their strong matches). Null with ONE_CLICK_FILING_ENABLED
 * off, before anything is read. Reads through B2's loaders, which never write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { flags } from '@/lib/flags';
import { listClaimFilingSummaries, previewLanes } from '@/lib/filing/v2/view';
import type { LaneView } from '@/lib/filing/v2/contract';
import type { OneClickDashboardData } from './types';

/** Lane lookups per dashboard load (strong matches only, best first). */
const MAX_LANE_LOOKUPS = 25;

export async function loadOneClickDashboard(args: {
  supabase: SupabaseClient;
  userId: string;
  now: Date;
  /** Settlement ids of strong matches only: possible matches never get the one-click entry. */
  strongMatchIds: readonly string[];
}): Promise<OneClickDashboardData | null> {
  if (!flags.oneClickFiling()) return null;
  const ids = [...new Set(args.strongMatchIds)].slice(0, MAX_LANE_LOOKUPS);
  const [summaries, lanes] = await Promise.all([
    listClaimFilingSummaries({ supabase: args.supabase, userId: args.userId, now: args.now })
      .then((result) => (result.ok ? result.items : null))
      .catch(() => null),
    ids.length
      ? previewLanes({ userId: args.userId, lawsuitIds: ids, now: args.now }).catch(() => new Map<string, LaneView>())
      : Promise.resolve(new Map<string, LaneView>()),
  ]);
  return { summaries, lanes: Object.fromEntries(lanes) };
}
