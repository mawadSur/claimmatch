import { serviceRoleConfigured } from '@/lib/claims-server';
import { LanePreviewQuerySchema } from '@/lib/filing/v2/contract';
import { loadSettlementEnvs, openForClaimsNow } from '@/lib/filing/v2/environment';
import { beginFilingRoute, fail, logFilingError, reply, zodFields } from '@/lib/filing/v2/http';
import { toClaimRecord } from '@/lib/filing/v2/records';
import { previewLaneFor } from '@/lib/filing/v2/view';
import { startableStatus } from '@/lib/filing/v2/view-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/filing/claims/preview?lawsuit_id=: the lane this member would get
 * on a settlement today, the claim they already have (if any) and whether
 * POST /api/filing/claims would start or resume one. Writes nothing.
 */
export async function GET(req: Request) {
  const begin = await beginFilingRoute(req, 'read');
  if (!begin.ok) return begin.response;
  const { supabase, user } = begin.caller;
  const query = LanePreviewQuerySchema.safeParse({ lawsuit_id: new URL(req.url).searchParams.get('lawsuit_id') ?? undefined });
  if (!query.success) return fail('invalid_request', { fields: zodFields(query.error) });
  const lawsuitId = query.data.lawsuit_id.toLowerCase();
  if (!serviceRoleConfigured()) return fail('service_unavailable');

  const now = new Date();
  const [envs, existing, profile] = await Promise.all([
    loadSettlementEnvs([lawsuitId], now),
    supabase.from('claims').select('*').eq('user_id', user.id).eq('lawsuit_id', lawsuitId).maybeSingle(),
    supabase.from('profiles').select('state').eq('id', user.id).maybeSingle(),
  ]);
  if (existing.error || profile.error) {
    logFilingError('preview read failed', existing.error ?? profile.error);
    return fail('service_unavailable');
  }
  if (!envs.ok) return fail('settlement_unavailable');
  const env = envs.envs.get(lawsuitId);
  if (!env || !env.context.published || env.context.fictional) return fail('not_found');
  const state = (profile.data as { state?: unknown } | null)?.state;
  const lane = previewLaneFor(env, envs.lane, typeof state === 'string' ? state : null, now);

  const claim = existing.data ? toClaimRecord(existing.data as Record<string, unknown>) : null;
  const startable = startableStatus(claim);
  const open = openForClaimsNow(env, env.approvedSpec?.content ?? null, now);
  const canStart = startable === 'resume' || (startable === 'start' && open);
  return reply({ preview: { lawsuit_id: lawsuitId, lane, claim_id: claim?.id ?? null, can_start: canStart } });
}
