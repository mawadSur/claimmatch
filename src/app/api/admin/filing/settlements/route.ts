import { SettlementListQuerySchema } from '@/lib/filing/v2/contract-staff';
import { canOpenFilingConsole } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { fail, guard, offsetOf, readQuery, reply } from '../_lib/http';
import { filterIds, LAWSUIT_LIST_SELECT, likePattern, settlementSummaries } from '../_lib/settlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/filing/settlements?q=&filter=&cursor=&limit= : the console overview (no member data). */
export async function GET(req: Request) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const query = readQuery(req, SettlementListQuerySchema);
  if (!query.ok) return query.res;
  const { q, filter, cursor, limit } = query.data;
  const svc = createServiceClient();
  const ids = await filterIds(svc, filter);
  if (ids && ids.length === 0) return reply({ items: [], next_cursor: null });
  const offset = offsetOf(cursor);
  let lookup = svc.from('lawsuits').select(LAWSUIT_LIST_SELECT);
  if (ids) lookup = lookup.in('id', ids.slice(0, 1000));
  if (q) lookup = lookup.ilike('title', likePattern(q));
  const { data, error } = await lookup
    .order('title', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return fail('service_unavailable');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const items = await settlementSummaries(svc, rows, new Date());
  return reply({ items, next_cursor: rows.length === limit ? String(offset + limit) : null });
}
