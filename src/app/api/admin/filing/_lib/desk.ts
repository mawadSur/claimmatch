/**
 * The filing desk: one job's screen (the signed packet, checked and in the
 * official order), confirmation screenshots (staff evidence, never readable
 * by the member) and the job's result. Staff file in their own browser.
 */
import { randomUUID } from 'node:crypto';
import { loadJobContext, preSendCheck, sha256Text, readStoredFile, type ServiceClient } from '@/lib/filing/channels/context';
import { blockedDestination } from '@/lib/filing/channels/cron-sweeps';
import { buildDeskView } from '@/lib/filing/channels/desk';
import type { FilingEvidence, FilingJobRecord } from '@/lib/filing/channels/types';
import { CLAIM_DOCUMENTS_BUCKET, DOCUMENT_MAX_BYTES, UPLOAD_URL_TTL_SECONDS, type FilingErrorCode } from '@/lib/filing/v2/contract';
import type { DeskPacketView } from '@/lib/filing/v2/contract-staff';
import type { JevResult } from '@/lib/jev/types';
import { recordFilingResult } from '@/lib/filing/v2/jobs';
import { staffLockOwner, type StaffUser } from '@/lib/staff-roles';

export const EVIDENCE_KIND = 'confirmation_screenshot';
const MAX_EVIDENCE_PER_JOB = 10;
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };

export async function loadJob(svc: ServiceClient, jobId: string): Promise<FilingJobRecord | null> {
  const { data } = await svc.from('claim_filing_jobs').select('*').eq('id', jobId).maybeSingle();
  return (data as FilingJobRecord | null) ?? null;
}

export function holdsLock(job: FilingJobRecord, staff: Pick<StaffUser, 'id'>): boolean {
  return job.status === 'in_progress' && job.lock_owner === staffLockOwner(staff);
}

/**
 * The lock ran out while this staff member was filing (the cron parked the
 * job as needs_attention, lock_expired): they may still record what happened.
 */
export function heldExpiredLock(job: FilingJobRecord, staff: Pick<StaffUser, 'id'>): boolean {
  return (
    job.status === 'needs_attention' &&
    job.needs_attention_reason === 'lock_expired' &&
    (job.result as { expired_lock_owner?: unknown } | null)?.expired_lock_owner === staffLockOwner(staff)
  );
}

/**
 * The desk screen for a job. A packet that does not match its signature is
 * never shown: a job this staff member holds goes to needs_attention instead.
 */
export async function deskView(
  svc: ServiceClient,
  job: FilingJobRecord,
  staff: StaffUser,
  now: Date,
  opts: { justTaken?: boolean } = {},
): Promise<{ ok: true; view: DeskPacketView } | { ok: false; code: FilingErrorCode }> {
  const loaded = await loadJobContext(svc, job);
  if (!loaded.ok) {
    console.error('[admin/filing] desk view refused', { job: job.id, reason: loaded.reason });
    if (holdsLock(job, staff)) {
      // Taken this instant and nothing shown: a settlement that could not be read goes back to the queue.
      const requeue = opts.justTaken === true && loaded.reason === 'settlement_unreadable';
      await recordFilingResult({
        jobId: job.id,
        lockOwner: staffLockOwner(staff),
        outcome: requeue ? 'not_submitted' : 'needs_attention',
        reasonCode: requeue ? null : loaded.reason,
        actor: 'staff',
        now,
      });
    }
    return { ok: false, code: 'service_unavailable' };
  }
  const { result } = await preSendCheck(svc, loaded.ctx, now, 'staff');
  return { ok: true, view: buildDeskView(loaded.ctx, result, staff) };
}

/**
 * A job Lawsuit AI may no longer file (a kill switch or an objection, a policy
 * or spec change, the channel's cutoff, a closed settlement: the pre_send
 * blocks nobody can fix by editing the claim) goes back to the member when the
 * desk takes it, as the cron's hand-back would: nothing was sent, and the kill
 * switch takes effect at once. The member-safe reason, or null when the desk
 * should see the job (no block, a block the member can fix, or checks that
 * could not run).
 */
export function deskHandBackReason(checks: DeskPacketView['checks']): string | null {
  if (checks.outcome !== 'block') return null;
  if (blockedDestination({ issues: checks.issues } as JevResult) !== 'self_file') return null;
  const cutoff = checks.issues.some((i) => i.severity === 'block' && i.rule_id === 'global.deadline_cutoff');
  return cutoff ? 'deadline_too_close' : 'not_offered_for_settlement';
}

/** An upload slot for a confirmation screenshot of a job this staff member holds. */
export async function createEvidenceSlot(
  svc: ServiceClient,
  job: FilingJobRecord,
  staff: StaffUser,
  file: { mime: string; size_bytes: number },
  now: Date,
) {
  if (!holdsLock(job, staff) && !heldExpiredLock(job, staff)) return { ok: false as const, code: 'lock_lost' as const };
  const { count } = await svc
    .from('claim_documents')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('source', 'staff_evidence');
  if ((count ?? 0) >= MAX_EVIDENCE_PER_JOB) return { ok: false as const, code: 'document_limit' as const };
  const id = randomUUID();
  const path = `${job.user_id}/${job.claim_id}/evidence/${id}.${EXTENSION[file.mime] ?? 'bin'}`;
  const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();
  const { data: row, error } = await svc
    .from('claim_documents')
    .insert({
      id,
      claim_id: job.claim_id,
      user_id: job.user_id,
      packet_id: null,
      job_id: job.id,
      source: 'staff_evidence',
      kind: EVIDENCE_KIND,
      storage_path: path,
      mime: file.mime,
      size_bytes: file.size_bytes,
      status: 'pending_upload',
      uploaded_by: staff.id,
      upload_expires_at: expiresAt,
    })
    .select('id, kind, status, mime, size_bytes, sha256, created_at, stored_at')
    .single();
  if (error || !row) return { ok: false as const, code: 'service_unavailable' as const };
  const { data: signed, error: signError } = await svc.storage.from(CLAIM_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (signError || !signed) return { ok: false as const, code: 'service_unavailable' as const };
  return {
    ok: true as const,
    body: {
      document: row,
      upload: { signed_url: signed.signedUrl, token: signed.token, path: signed.path ?? path, expires_at: expiresAt },
    },
  };
}

/** The file's real type from its first bytes. */
export function sniffMime(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

/**
 * The job's uploaded screenshots: each read back, size and real type checked,
 * hashed and marked stored. Any one that fails stops the result (nothing recorded).
 */
export async function finalizeEvidence(
  svc: ServiceClient,
  job: FilingJobRecord,
  ids: string[],
  now: Date,
): Promise<{ ok: true; evidence: FilingEvidence[] } | { ok: false; code: FilingErrorCode }> {
  if (ids.length === 0) return { ok: true, evidence: [] };
  const { data } = await svc
    .from('claim_documents')
    .select('id, status, mime, storage_path, sha256, job_id, source')
    .in('id', ids)
    .eq('job_id', job.id)
    .eq('source', 'staff_evidence');
  const rows = (data ?? []) as Array<{ id: string; status: string; mime: string; storage_path: string; sha256: string | null }>;
  if (rows.length !== new Set(ids).size) return { ok: false, code: 'document_invalid' };
  const evidence: FilingEvidence[] = [];
  for (const row of rows) {
    if (row.status === 'stored' && row.sha256) {
      evidence.push({ kind: 'screenshot', document_id: row.id, sha256: row.sha256, captured_at: now.toISOString() });
      continue;
    }
    if (row.status !== 'pending_upload') return { ok: false, code: 'document_invalid' };
    let bytes: Uint8Array;
    try {
      bytes = await readStoredFile(svc, row.storage_path);
    } catch {
      return { ok: false, code: 'upload_incomplete' };
    }
    if (bytes.byteLength === 0 || bytes.byteLength > DOCUMENT_MAX_BYTES || sniffMime(bytes) !== row.mime) {
      return { ok: false, code: 'document_invalid' };
    }
    const sha256 = sha256Text(bytes);
    const { error } = await svc
      .from('claim_documents')
      .update({ status: 'stored', sha256, stored_at: now.toISOString(), size_bytes: bytes.byteLength })
      .eq('id', row.id)
      .eq('status', 'pending_upload');
    if (error) return { ok: false, code: 'service_unavailable' };
    evidence.push({ kind: 'screenshot', document_id: row.id, sha256, captured_at: now.toISOString() });
  }
  return { ok: true, evidence };
}
