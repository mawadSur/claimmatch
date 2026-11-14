/**
 * Writing packets (service role, after the route checked the member owns the
 * claim): create one, save one with Jev, and keep the claim's status in step
 * (preparing <-> ready, the first save after needs_you). Every Jev run of a
 * real packet is stored in jev_runs; the packet keeps the member-audience
 * result. Values whose issue code is in JEV_REFUSE_TO_STORE_CODES are never
 * stored. Server only.
 */
import { runJev } from '../../jev/index';
import { JEV_REFUSE_TO_STORE_CODES, type JevMode, type JevResult, type JevTrigger } from '../../jev/types';
import { createServiceClient } from '@/lib/supabase/server';
import type { FilingErrorCode, JevIssueView } from './contract';
import { derivePacketState, type ClaimContext, type PacketContent, type PacketState } from './claim-context';
import type { DocumentRecord } from './documents';
import { dbErrorCode, logFilingError } from './http';
import { buildJevInput } from './lanes';
import { PACKET_COLUMNS, toPacketRecord, type PacketRecord, type SpecRecord } from './records';

export type SaveFailure = { ok: false; code: FilingErrorCode; issues?: JevIssueView[] };

const REFUSE_CODE: Readonly<Record<string, FilingErrorCode>> = {
  secret_like_value: 'not_collected',
  not_collected: 'not_collected',
  unknown_question: 'not_collected',
  health_consent_required: 'health_consent_required',
};

export function memberIssues(result: JevResult | null): JevIssueView[] {
  return (result?.issues ?? [])
    .filter((i) => i.audience === 'member')
    .map((i) => ({ rule_id: i.rule_id, source: i.source, severity: i.severity, code: i.code, message: i.message, field: i.field }));
}

/** What claim_packets.jev_result keeps: the run without staff-audience issues. */
export function storedJev(result: JevResult): JevResult {
  const issues = result.issues.filter((i) => i.audience === 'member');
  const count = (s: string) => issues.filter((i) => i.severity === s).length;
  return { ...result, issues, counts: { block: count('block'), warn: count('warn'), info: count('info') } };
}

/** The mode a member save runs: pre_sign once the packet is complete on an agent lane, else partial. */
export function saveMode(state: PacketState): JevMode {
  return state.lane.view.agent && state.canonical ? 'pre_sign' : 'partial';
}

/** runJev, or null when it throws (callers fail closed where it matters). */
export function runJevFor(ctx: ClaimContext, state: PacketState, mode: JevMode): JevResult | null {
  try {
    return runJev(
      buildJevInput({
        mode,
        now: ctx.now,
        lane: state.lane.view.lane,
        draft: state.draft,
        packetHash: state.hash,
        spec: state.spec,
        env: ctx.env,
        lane_result: state.lane,
      }),
    );
  } catch (error) {
    logFilingError('runJev failed', { code: error instanceof Error ? error.name : null });
    return null;
  }
}

/** Stores one run (append-only). Returns its id, or null when the write failed. */
export async function recordJevRun(args: {
  ctx: ClaimContext;
  packetId: string;
  state: PacketState;
  result: JevResult;
  trigger: JevTrigger;
}): Promise<string | null> {
  const { ctx, state, result } = args;
  const { data, error } = await createServiceClient()
    .from('jev_runs')
    .insert({
      claim_id: ctx.claim.id,
      user_id: ctx.userId,
      packet_id: args.packetId,
      mode: result.mode,
      triggered_by: args.trigger,
      outcome: result.outcome,
      issues: result.issues,
      packet_hash: state.hash,
      spec_id: state.spec?.id ?? null,
      spec_version: state.spec?.version ?? null,
      lane: state.lane.view.lane,
      rule_set_hash: result.rule_set_hash,
      engine_version: result.engine_version,
    })
    .select('id')
    .maybeSingle();
  if (error || !data) {
    logFilingError('jev run write failed', error);
    return null;
  }
  return String((data as { id: unknown }).id);
}

/** Refuse-to-store issues on the paths this request changed. */
export function refusals(result: JevResult, changedPaths: string[]): { code: FilingErrorCode; issues: JevIssueView[] } | null {
  const touched = new Set(changedPaths);
  const docKinds = new Set(changedPaths.filter((p) => p.startsWith('documents.')).map((p) => `doc_count.${p.slice(10)}`));
  const hits = result.issues.filter(
    (i) =>
      (JEV_REFUSE_TO_STORE_CODES as readonly string[]).includes(i.code) &&
      i.field !== null &&
      (touched.has(i.field) || docKinds.has(i.field)),
  );
  if (!hits.length) return null;
  const code = REFUSE_CODE[hits[0].code] ?? 'not_collected';
  return { code, issues: memberIssues({ ...result, issues: hits }) };
}

const AGENT_EDITABLE = new Set(['preparing', 'ready', 'needs_you']);

/** The status a member-side packet change leaves the claim in (null: unchanged). */
export function nextStatus(current: string, state: PacketState, result: JevResult | null): string | null {
  if (!AGENT_EDITABLE.has(current)) return null;
  const ready = state.lane.view.agent && state.canonical !== null && result?.mode === 'pre_sign' && result.outcome !== 'block';
  const target = ready ? 'ready' : 'preparing';
  return target === current ? null : target;
}

/** claim_apply_change for the system's preparing/ready moves. A concurrent change (40001) is left as it is. */
export async function syncClaimStatus(ctx: ClaimContext, from: string, to: string, detail: Record<string, unknown>) {
  const { error } = await createServiceClient().rpc('claim_apply_change', {
    p_claim_id: ctx.claim.id,
    p_user_id: ctx.userId,
    p_expected_status: from,
    p_changes: { status: to },
    p_actor: 'system',
    p_detail: { action: 'packet_checked', ...detail },
  });
  if (error && error.code !== '40001') logFilingError('claim status sync failed', error);
}

/** Creates the claim's packet on the approved spec (or none). A concurrent create returns the existing row. */
export async function createPacket(ctx: ClaimContext): Promise<{ ok: true; packet: PacketRecord } | SaveFailure> {
  const spec = ctx.env.approvedSpec;
  const content: PacketContent = {
    answers: {},
    member_snapshot: {},
    benefit_tier: null,
    payout_method: null,
    class_definition_confirmed_at: null,
    health_consent_at: null,
    health_consent_text_sha256: null,
  };
  const state = derivePacketState(ctx, content, spec, []);
  const result = runJevFor(ctx, state, 'partial');
  const db = createServiceClient();
  const inserted = await db
    .from('claim_packets')
    .insert({
      claim_id: ctx.claim.id,
      user_id: ctx.userId,
      lawsuit_id: ctx.claim.lawsuit_id,
      spec_id: spec?.id ?? null,
      spec_version: spec?.version ?? null,
      status: 'open',
      revision: 1,
      answers: {},
      member_snapshot: {},
      packet_hash: state.hash,
      jev_outcome: result?.outcome ?? null,
      jev_result: result ? storedJev(result) : null,
      jev_checked_at: result ? ctx.now.toISOString() : null,
    })
    .select(PACKET_COLUMNS)
    .maybeSingle();
  if (inserted.error?.code === '23505') {
    const existing = await db.from('claim_packets').select(PACKET_COLUMNS).eq('claim_id', ctx.claim.id).maybeSingle();
    if (existing.error || !existing.data) return { ok: false, code: 'service_unavailable' };
    return { ok: true, packet: toPacketRecord(existing.data as Record<string, unknown>) };
  }
  if (inserted.error || !inserted.data) {
    logFilingError('packet create failed', inserted.error);
    return { ok: false, code: dbErrorCode(inserted.error) };
  }
  const packet = toPacketRecord(inserted.data as Record<string, unknown>);
  if (result) await recordJevRun({ ctx, packetId: packet.id, state, result, trigger: 'member_save' });
  return { ok: true, packet };
}

export interface SaveInput {
  ctx: ClaimContext;
  packet: PacketRecord;
  content: PacketContent;
  spec: SpecRecord | null;
  documents: DocumentRecord[];
  /** Packet paths this request changed (answers.x, member.y, documents.kind, ...). */
  changedPaths: string[];
  detail: Record<string, unknown>;
}

export type PreparedSave = { ok: true; state: PacketState; result: JevResult };

/** The check half of a save: derive the packet, run Jev, refuse never-store values. Writes nothing. */
export function preparePacketSave(input: SaveInput): PreparedSave | SaveFailure {
  if (!input.spec && input.packet.spec_id) {
    // The packet's spec could not be read (and none is approved): never drop the link or its answers.
    logFilingError('packet spec unreadable on save', { code: null });
    return { ok: false, code: 'service_unavailable' };
  }
  const state = derivePacketState(input.ctx, input.content, input.spec, input.documents);
  const result = runJevFor(input.ctx, state, saveMode(state));
  if (!result) return { ok: false, code: 'service_unavailable' };
  const refused = refusals(result, input.changedPaths);
  if (refused) return { ok: false, ...refused };
  return { ok: true, state, result };
}

/**
 * The write half: logs the run, stores the content with the member-audience
 * result and the hash while complete, bumps the revision (409
 * revision_conflict when it moved) and moves the claim between preparing and
 * ready.
 */
export async function commitPacketSave(input: SaveInput, prepared: PreparedSave): Promise<{ ok: true; state: PacketState } | SaveFailure> {
  const { ctx, packet } = input;
  const { state, result } = prepared;
  if (!(await recordJevRun({ ctx, packetId: packet.id, state, result, trigger: 'member_save' }))) {
    return { ok: false, code: 'service_unavailable' };
  }
  const { data, error } = await createServiceClient()
    .from('claim_packets')
    .update({
      spec_id: input.spec?.id ?? null,
      spec_version: input.spec?.version ?? null,
      ...input.content,
      packet_hash: state.hash,
      jev_outcome: result.outcome,
      jev_result: storedJev(result),
      jev_checked_at: ctx.now.toISOString(),
      revision: packet.revision + 1,
    })
    .eq('id', packet.id)
    .eq('revision', packet.revision)
    .eq('status', 'open')
    .select('id');
  if (error) return { ok: false, code: dbErrorCode(error) === 'service_unavailable' ? logged(error) : dbErrorCode(error) };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, code: 'revision_conflict' };
  const to = nextStatus(ctx.claim.status, state, result);
  if (to) await syncClaimStatus(ctx, ctx.claim.status, to, { revision: packet.revision + 1, ...input.detail });
  return { ok: true, state };
}

/** preparePacketSave, then commitPacketSave. */
export async function savePacket(input: SaveInput): Promise<{ ok: true; state: PacketState } | SaveFailure> {
  const prepared = preparePacketSave(input);
  if (!prepared.ok) return prepared;
  return commitPacketSave(input, prepared);
}

function logged(error: { code?: string | null }): FilingErrorCode {
  logFilingError('packet save failed', error);
  return 'service_unavailable';
}
