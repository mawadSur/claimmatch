import { POLICY_SELECT } from '@/lib/filing/channels/policy';
import { canOpenFilingConsole } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { fail, guard, reply, routeId } from '../../_lib/http';
import { LAWSUIT_LIST_SELECT, settlementSummaries } from '../../_lib/settlements';
import { controlsView, policyView, SPEC_SELECT, specView } from '../../_lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

/** GET /api/admin/filing/settlements/{lawsuitId}: every policy and spec version and the controls. */
export async function GET(req: Request, { params }: { params: Promise<{ lawsuitId: string }> }) {
  const auth = await guard(req, canOpenFilingConsole);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'lawsuitId');
  if (!id.ok) return id.res;
  const svc = createServiceClient();
  const { data: lawsuit } = await svc.from('lawsuits').select(LAWSUIT_LIST_SELECT).eq('id', id.id).maybeSingle();
  if (!lawsuit) return fail('not_found');
  const adminId = typeof lawsuit.administrator_id === 'string' ? lawsuit.administrator_id : null;
  const none = Promise.resolve({ data: [] as Row[] });
  const [[summary], policies, adminPolicies, specs, controls, adminControls] = await Promise.all([
    settlementSummaries(svc, [lawsuit as Row], new Date()),
    svc.from('filing_policies').select(POLICY_SELECT).eq('lawsuit_id', id.id).order('version', { ascending: false }),
    adminId ? svc.from('filing_policies').select(POLICY_SELECT).eq('administrator_id', adminId).order('version', { ascending: false }) : none,
    svc.from('filing_specs').select(SPEC_SELECT).eq('lawsuit_id', id.id).order('version', { ascending: false }),
    svc.from('filing_controls').select('*').eq('lawsuit_id', id.id),
    adminId ? svc.from('filing_controls').select('*').eq('administrator_id', adminId) : none,
  ]);
  return reply({
    summary,
    policies: ((policies.data ?? []) as Row[]).map(policyView),
    administrator_policies: ((adminPolicies.data ?? []) as Row[]).map(policyView),
    specs: ((specs.data ?? []) as Row[]).map(specView),
    controls: [...((controls.data ?? []) as Row[]), ...((adminControls.data ?? []) as Row[])].map(controlsView),
  });
}
