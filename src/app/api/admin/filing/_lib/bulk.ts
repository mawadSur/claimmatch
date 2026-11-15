/**
 * administrator_bulk exports and results. An export takes up to max_rows
 * queued jobs of one settlement (claims that were withdrawn have no queued
 * job, so they are never in it), runs pre_send Jev on each, writes the
 * channel's CSV, records the batch (hash and count only) and the audit row,
 * and marks the jobs exported (awaiting the administrator's results). Staff
 * upload the file to the administrator's portal themselves.
 */
import { buildBulkCsv, bulkFileName, type BulkRowInput } from '@/lib/filing/channels/bulk';
import { loadJobContext, loadSettlementFiling, preSendCheck, sha256Text, type ServiceClient } from '@/lib/filing/channels/context';
import type { FilingJobRecord } from '@/lib/filing/channels/types';
import { AdministratorBulkConfigSchema, type ChannelConfigFor } from '@/lib/filing/v2/contract-spec';
import type { FilingErrorCode } from '@/lib/filing/v2/contract';
import { claimNextJob, recordFilingResult, DESK_LOCK_MINUTES } from '@/lib/filing/v2/jobs';
import { recordStaffAccess, staffLockOwner, type StaffUser } from '@/lib/staff-roles';

const CONCURRENCY = 6;

async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  return out;
}

export type BulkExport =
  | { ok: true; csv: string; fileName: string; batchId: string; rows: number; sha256: string; skipped: number }
  | { ok: false; code: FilingErrorCode };

export async function exportBulk(
  svc: ServiceClient,
  staff: StaffUser,
  input: { lawsuitId: string; maxRows?: number },
  req: Request,
  now: Date,
): Promise<BulkExport> {
  const settlement = await loadSettlementFiling(svc, input.lawsuitId);
  if (!settlement) return { ok: false, code: 'not_found' };
  const raw = settlement.policy.channels.find((c) => c.type === 'administrator_bulk');
  const parsed = AdministratorBulkConfigSchema.safeParse(raw);
  if (!parsed.success || settlement.policy.agent_filing !== 'allowed' || settlement.policy.kill_switch || settlement.policy.objection_received_at) {
    return { ok: false, code: 'lane_unavailable' };
  }
  const config: ChannelConfigFor<'administrator_bulk'> = parsed.data;
  const limit = Math.min(input.maxRows ?? config.max_rows, config.max_rows);
  const { data: candidates, error } = await svc
    .from('claim_filing_jobs')
    .select('id')
    .eq('channel', 'administrator_bulk')
    .eq('status', 'queued')
    .eq('lawsuit_id', input.lawsuitId)
    .lte('run_after', now.toISOString())
    .order('due_by', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { ok: false, code: 'service_unavailable' };
  const lockOwner = staffLockOwner(staff);

  // Take each job (claim queued -> filing, locked to this staff member) and check it.
  const taken = await inBatches((candidates ?? []) as Array<{ id: string }>, async ({ id }) => {
    const claimed = await claimNextJob({ channel: 'administrator_bulk', lockOwner, actor: 'staff', jobId: id, lockMinutes: DESK_LOCK_MINUTES });
    return claimed.ok ? claimed.job : null;
  });
  const jobs = taken.filter((j): j is FilingJobRecord => j !== null);
  const rows: Array<BulkRowInput & { job: FilingJobRecord }> = [];
  let skipped = 0;
  const settlements = new Map([[input.lawsuitId, settlement]]);
  const identities = new Map<string, Array<{ user_id: string; key: string }>>();
  const checked = await inBatches(jobs, async (job) => {
    const loaded = await loadJobContext(svc, job, settlements);
    if (!loaded.ok) return { job, reason: loaded.reason, ctx: null };
    const { result } = await preSendCheck(svc, loaded.ctx, now, 'staff', identities);
    return { job, reason: result.outcome === 'block' ? 'jev_blocked' : null, ctx: loaded.ctx };
  });
  for (const { job, reason, ctx } of checked) {
    if (reason || !ctx) {
      skipped += 1;
      await recordFilingResult({ jobId: job.id, lockOwner, outcome: 'needs_attention', reasonCode: reason ?? 'record_missing', actor: 'staff', now });
      continue;
    }
    rows.push({
      job,
      jobId: job.id,
      claimId: job.claim_id,
      packet: ctx.packet,
      spec: ctx.spec.content,
      signature: {
        id: ctx.signature.signature_id,
        typed_name: ctx.signature.typed_name,
        signed_at: ctx.signature.signed_at,
        packet_hash: ctx.signature.packet_hash,
      },
    });
  }
  if (rows.length === 0) return { ok: false, code: 'not_found' };

  const release = () =>
    inBatches(rows, (r) => recordFilingResult({ jobId: r.jobId, lockOwner, outcome: 'not_submitted', actor: 'staff', now }));
  const { csv, columns } = buildBulkCsv(config, rows);
  const fileSha = sha256Text(csv);
  const { data: batch, error: batchError } = await svc
    .from('filing_export_batches')
    .insert({
      lawsuit_id: input.lawsuitId,
      policy_id: settlement.policy.settlement_policy_id,
      row_count: rows.length,
      columns,
      file_sha256: fileSha,
      created_by: staff.id,
    })
    .select('id')
    .single();
  if (batchError || !batch) {
    await release();
    return { ok: false, code: 'service_unavailable' };
  }
  const batchId = String(batch.id);
  const logged = await recordStaffAccess({
    staff,
    action: 'export_bulk',
    lawsuitId: input.lawsuitId,
    targetTable: 'filing_export_batches',
    targetId: batchId,
    detail: { rows: rows.length, file_sha256: fileSha, job_ids: rows.map((r) => r.jobId), skipped },
    req,
  });
  if (!logged) {
    // No audit row, no file: the jobs go back to the queue and the batch is removed.
    await release();
    await svc.from('filing_export_batches').delete().eq('id', batchId);
    return { ok: false, code: 'service_unavailable' };
  }
  const exportedAt = now.toISOString();
  await inBatches(
    rows.map((r, i) => ({ r, i })),
    async ({ r, i }) => {
      const done = await recordFilingResult({
        jobId: r.jobId,
        lockOwner,
        outcome: 'exported',
        evidence: [{ kind: 'bulk_export', batch_id: batchId, row_number: i + 1, file_sha256: fileSha, exported_at: exportedAt }],
        result: { export_batch_id: batchId },
        actor: 'staff',
        now,
      });
      if (done.ok) await svc.from('claim_filing_jobs').update({ export_batch_id: batchId }).eq('id', r.jobId).eq('status', 'exported');
      return done.ok;
    },
  );
  return {
    ok: true,
    csv,
    fileName: bulkFileName(config.file_name_prefix, settlement.lawsuit.slug, batchId, now),
    batchId,
    rows: rows.length,
    sha256: fileSha,
    skipped,
  };
}

export interface BulkResult {
  job_id: string;
  outcome: 'filed' | 'rejected' | 'needs_attention';
  confirmation_number: string | null;
  reason_code: string | null;
}

/** The administrator's answer for each exported claim of a batch. */
export async function recordBulkResults(
  svc: ServiceClient,
  batchId: string,
  results: BulkResult[],
  now: Date,
): Promise<{ ok: true; recorded: number; failed: Array<{ job_id: string; code: FilingErrorCode }> } | { ok: false; code: FilingErrorCode }> {
  const { data: batch } = await svc.from('filing_export_batches').select('id').eq('id', batchId).maybeSingle();
  if (!batch) return { ok: false, code: 'not_found' };
  const ids = [...new Set(results.map((r) => r.job_id))];
  const { data: jobs } = await svc.from('claim_filing_jobs').select('id, export_batch_id, evidence').in('id', ids);
  const inBatch = new Set(
    ((jobs ?? []) as Array<{ id: string; export_batch_id: string | null; evidence: unknown }>)
      .filter(
        (j) =>
          j.export_batch_id === batchId ||
          (Array.isArray(j.evidence) && (j.evidence as Array<{ kind?: string; batch_id?: string }>).some((e) => e?.kind === 'bulk_export' && e.batch_id === batchId)),
      )
      .map((j) => j.id),
  );
  const failed: Array<{ job_id: string; code: FilingErrorCode }> = [];
  let recorded = 0;
  for (const result of results) {
    if (!inBatch.has(result.job_id)) {
      failed.push({ job_id: result.job_id, code: 'not_found' });
      continue;
    }
    if (result.outcome !== 'filed' && !result.reason_code) {
      failed.push({ job_id: result.job_id, code: 'invalid_request' });
      continue;
    }
    const done = await recordFilingResult({
      jobId: result.job_id,
      lockOwner: null,
      outcome: result.outcome,
      confirmationNumber: result.outcome === 'filed' ? result.confirmation_number : null,
      reasonCode: result.reason_code,
      result: { bulk_batch_id: batchId },
      actor: 'staff',
      now,
    });
    if (done.ok) recorded += 1;
    else failed.push({ job_id: result.job_id, code: done.code });
  }
  if (recorded > 0) await svc.from('filing_export_batches').update({ results_recorded_at: now.toISOString() }).eq('id', batchId);
  return { ok: true, recorded, failed };
}
