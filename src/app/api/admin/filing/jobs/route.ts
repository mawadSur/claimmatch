import { jobSummary } from '@/lib/filing/channels/desk';
import { officialDeadline } from '@/lib/filing/channels/context';
import type { FilingJobRecord } from '@/lib/filing/channels/types';
import { JobListQuerySchema } from '@/lib/filing/v2/contract-staff';
import { canOpenFilingConsole } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { fail, guard, offsetOf, readQuery, reply } from '../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/filing/jobs?status=&channel=&lawsuit_id=&cursor=&limit= : soonest due first; no member data. */
export async function GET(req: Request) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const query = readQuery(req, JobListQuerySchema);
  if (!query.ok) return query.res;
  const { status, channel, lawsuit_id: lawsuitId, cursor, limit } = query.data;
  const svc = createServiceClient();
  let lookup = svc.from('claim_filing_jobs').select('*');
  if (status) lookup = lookup.eq('status', status);
  if (channel) lookup = lookup.eq('channel', channel);
  if (lawsuitId) lookup = lookup.eq('lawsuit_id', lawsuitId);
  const offset = offsetOf(cursor);
  const { data, error } = await lookup
    .order('due_by', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return fail('service_unavailable');
  const jobs = (data ?? []) as FilingJobRecord[];
  const ids = [...new Set(jobs.map((j) => j.lawsuit_id))];
  const { data: lawsuits } = ids.length
    ? await svc.from('lawsuits').select('id, slug, title, deadline').in('id', ids)
    : { data: [] as Array<{ id: string; slug: string; title: string; deadline: string | null }> };
  const facts = new Map(
    ((lawsuits ?? []) as Array<{ id: string; slug: string; title: string; deadline: string | null }>).map((l) => [
      l.id,
      { settlementTitle: l.title, deadline: officialDeadline(l) },
    ]),
  );
  const items = jobs.map((job) => jobSummary(job, facts.get(job.lawsuit_id) ?? { settlementTitle: 'Settlement', deadline: null }, auth.staff));
  return reply({ items, next_cursor: jobs.length === limit ? String(offset + limit) : null });
}
