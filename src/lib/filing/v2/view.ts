/**
 * Server loaders for the member's one-click views, shared by the API routes
 * (src/app/api/filing/claims/**) and server components (dashboard, claim
 * page). The signatures and comments are the CONTRACT (B2 implements them).
 * They read only: no row is created or changed, and with
 * ONE_CLICK_FILING_ENABLED off callers must not call them at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import type { ClaimFilingSummary, ClaimFilingView, FilingErrorCode, LaneView } from './contract';
import { buildClaimFilingView, claimSummary } from './view-model';
import { loadClaimContext, toProfileRecord, PROFILE_COLUMNS, loadPacketSpec, type ClaimContext } from './claim-context';
import { DOCUMENT_COLUMNS, toDocumentRecord } from './documents';
import { loadSettlementEnvs, type LaneEnv, type SettlementEnv } from './environment';
import { logFilingError } from './http';
import { computeLane, healthFacts } from './lanes';
import {
  PACKET_COLUMNS,
  SIGNATURE_COLUMNS,
  liveSignature,
  toClaimRecord,
  toPacketRecord,
  type PacketRecord,
} from './records';
import { AGENT_CLAIM_STATUSES } from './contract';

export type LoadFilingViewResult = { ok: true; view: ClaimFilingView } | { ok: false; code: FilingErrorCode };

/**
 * One claim's view for its owner. `supabase` is the caller's own client from
 * getRequestUser (RLS: own rows only); settlement facts, specs and policies
 * are read with the service role. `freshSignIn` says whether the session has
 * a real sign-in within REAUTH_MAX_AGE_SECONDS (sets actions.needs_fresh_sign_in).
 * not_found when the claim is not this user's.
 */
export async function loadClaimFilingView(args: {
  supabase: SupabaseClient;
  userId: string;
  claimId: string;
  now: Date;
  freshSignIn: boolean;
}): Promise<LoadFilingViewResult> {
  const loaded = await loadClaimContext({ ...args, withEvents: true });
  if (!loaded.ok) return loaded;
  return { ok: true, view: buildClaimFilingView(loaded.ctx, args.freshSignIn) };
}

type Rows = { data: unknown; error: { code?: string } | null };
const rows = (r: Rows) => (Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []);
const AGENT = new Set<string>(AGENT_CLAIM_STATUSES);

/** The member's claims with their lane and status, soonest deadline first (dashboard and app list). */
export async function listClaimFilingSummaries(args: {
  supabase: SupabaseClient;
  userId: string;
  now: Date;
}): Promise<{ ok: true; items: ClaimFilingSummary[] } | { ok: false; code: FilingErrorCode }> {
  const { supabase, userId, now } = args;
  const [claims, packets, docs, sigs, voids, profile] = (await Promise.all([
    supabase.from('claims').select('*').eq('user_id', userId),
    supabase.from('claim_packets').select(PACKET_COLUMNS).eq('user_id', userId),
    supabase.from('claim_documents').select(DOCUMENT_COLUMNS).eq('user_id', userId),
    supabase.from('claim_signatures').select(SIGNATURE_COLUMNS).eq('user_id', userId),
    supabase.from('claim_signature_voids').select('signature_id').eq('user_id', userId),
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
  ])) as Rows[];
  for (const read of [claims, packets, docs, sigs, voids, profile]) {
    if (read.error) {
      logFilingError('filing list read failed', read.error);
      return { ok: false, code: 'service_unavailable' };
    }
  }
  const packetBy = new Map<string, PacketRecord>();
  for (const row of rows(packets)) {
    const p = toPacketRecord(row);
    packetBy.set(p.claim_id, p);
  }
  const mine = rows(claims)
    .map(toClaimRecord)
    .filter((c) => c.user_id === userId && (packetBy.has(c.id) || AGENT.has(c.status)));
  if (mine.length === 0) return { ok: true, items: [] };
  const envs = await loadSettlementEnvs(mine.map((c) => c.lawsuit_id), now);
  if (!envs.ok) return { ok: false, code: 'settlement_unavailable' };
  const voided = new Set(rows(voids).map((v) => String(v.signature_id)));
  const documents = rows(docs).map(toDocumentRecord).filter((d) => d.source === 'member');
  const profileRecord = toProfileRecord(profile.data as Record<string, unknown> | null);
  const items: ClaimFilingSummary[] = [];
  for (const claim of mine) {
    const env = envs.envs.get(claim.lawsuit_id);
    if (!env) continue;
    const packet = packetBy.get(claim.id) ?? null;
    const packetSpec = await loadPacketSpec(packet, env);
    if (packetSpec === 'error') return { ok: false, code: 'service_unavailable' };
    const ctx: ClaimContext = {
      now,
      userId,
      claim,
      env,
      laneEnv: envs.lane,
      packet,
      packetSpec,
      documents: documents.filter((d) => d.claim_id === claim.id),
      signature: liveSignature(rows(sigs).filter((s) => s.claim_id === claim.id), voided),
      profile: profileRecord,
      consents: [],
      events: [],
    };
    items.push(claimSummary(ctx));
  }
  items.sort((a, b) => {
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    }
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  });
  return { ok: true, items };
}

/**
 * The lane each settlement would get for this member today (match cards and
 * the claim page before a claim exists). Settlements that cannot be read are
 * left out of the map; callers then show the existing self-file path.
 */
export async function previewLanes(args: { userId: string; lawsuitIds: string[]; now: Date }): Promise<Map<string, LaneView>> {
  const out = new Map<string, LaneView>();
  const envs = await loadSettlementEnvs(args.lawsuitIds, args.now);
  if (!envs.ok) return out;
  let state: string | null = null;
  try {
    const { data, error } = (await createServiceClient()
      .from('profiles')
      .select('state')
      .eq('id', args.userId)
      .maybeSingle()) as { data: { state?: unknown } | null; error: { code?: string } | null };
    if (error) {
      logFilingError('preview profile read failed', error);
      return out;
    }
    state = typeof data?.state === 'string' ? data.state : null;
  } catch {
    return out;
  }
  for (const [id, env] of envs.envs) out.set(id, previewLaneFor(env, envs.lane, state, args.now));
  return out;
}

/** The lane one settlement would get for a member in `memberState` before any packet exists. */
export function previewLaneFor(env: SettlementEnv, laneEnv: LaneEnv, memberState: string | null, now: Date): LaneView {
  const health = healthFacts({ env, spec: env.approvedSpec?.content ?? null, draft: null, consent: null });
  return computeLane({ env, laneEnv, draft: null, memberState, health, now }).view;
}
