/**
 * Retention periods for one-click filing (go-live checklist item 14). The
 * schedule the law firm approves is docs/legal/retention-schedule.md; every
 * period below is a default until then, and each has one switch:
 *
 *   member uploads        DOCUMENT_RETENTION_DAYS (90) after the claim's final
 *                         status, or after the deadline plus the late-report
 *                         window (retentionSweep in channels/cron-sweeps.ts)
 *   pending upload slots  2 hours (expirePendingUploads)
 *   Jev partial runs      kept unless JEV_PARTIAL_RUN_RETENTION_DAYS is set;
 *                         pre_sign and pre_send runs stay with the claim
 *   signatures, voids,    kept while the account exists; on deletion per
 *   consents, jobs,       LEGAL_RECORDS_ON_ACCOUNT_DELETION (legal-records.ts)
 *   staff evidence
 *   archived records      LEGAL_RECORD_RETENTION_DAYS (2555) after deletion
 *   filing_audit_log      kept: append-only for every role (0041/0042), so a
 *                         shorter period needs a new migration
 */
import { CLAIM_DOCUMENTS_BUCKET, DOCUMENT_RETENTION_DAYS } from './v2/contract-base';
import { legalRecordRetentionDays, legalRecordsMode, retentionDaysFromEnv } from './legal-records';
import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

const DAY_MS = 86_400_000;
const BATCH = 200;

export interface RetentionPeriod {
  record: string;
  period: string;
  setting: string | null;
  where: string;
}

/** What is in force right now (the /admin filing console and the docs read the same list). */
export function retentionSchedule(env: Record<string, string | undefined> = process.env): RetentionPeriod[] {
  const jev = jevPartialRunRetentionDays(env);
  return [
    {
      record: 'Member proof uploads (photos, documents)',
      period: `${DOCUMENT_RETENTION_DAYS} days after the claim's final status, or after the deadline plus the late-report window`,
      setting: 'DOCUMENT_RETENTION_DAYS (code constant)',
      where: 'src/lib/filing/channels/cron-sweeps.ts retentionSweep',
    },
    { record: 'Unfinished upload slots', period: '2 hours', setting: null, where: 'cron-sweeps.ts expirePendingUploads' },
    {
      record: 'Jev partial-mode runs (checks while the member fills in the packet)',
      period: jev ? `${jev} days` : 'kept with the claim',
      setting: 'JEV_PARTIAL_RUN_RETENTION_DAYS',
      where: 'src/lib/filing/retention.ts pruneJevPartialRuns',
    },
    {
      record: 'Jev pre_sign and pre_send runs',
      period: 'kept with the claim',
      setting: null,
      where: 'jev_runs (0041)',
    },
    {
      record: 'Signatures, voids, e-sign consents, filing jobs, staff evidence',
      period: `kept while the account exists; on deletion: ${legalRecordsMode(env)}`,
      setting: 'LEGAL_RECORDS_ON_ACCOUNT_DELETION',
      where: 'src/lib/filing/legal-records.ts, POST /api/account/delete',
    },
    {
      record: 'Legal records kept after account deletion',
      period: `${legalRecordRetentionDays(env)} days after deletion`,
      setting: 'LEGAL_RECORD_RETENTION_DAYS',
      where: 'src/lib/filing/retention.ts archiveRetentionSweep',
    },
    {
      record: 'Staff access and decision log (filing_audit_log)',
      period: 'kept (append-only for every role)',
      setting: null,
      where: 'filing_audit_log (0041, 0042)',
    },
  ];
}

/** Null (keep) unless JEV_PARTIAL_RUN_RETENTION_DAYS is a whole number of days, at least 30. */
export function jevPartialRunRetentionDays(env: Record<string, string | undefined> = process.env): number | null {
  const days = retentionDaysFromEnv(env.JEV_PARTIAL_RUN_RETENTION_DAYS, 0);
  return days >= 30 ? days : null;
}

/**
 * Partial-mode Jev runs (the checks while a member fills in a packet) older
 * than the set period. Never a pre_sign or pre_send run: those are the
 * record of what was checked before signing and sending. Off by default.
 */
export async function pruneJevPartialRuns(
  svc: ServiceClient,
  now: Date,
  days = jevPartialRunRetentionDays(),
): Promise<{ deleted: number; enabled: boolean }> {
  if (!days) return { deleted: 0, enabled: false };
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString();
  const { data, error } = await svc
    .from('jev_runs')
    .select('id')
    .eq('mode', 'partial')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`jev retention: ${error.code ?? 'read failed'}`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return { deleted: 0, enabled: true };
  const { data: gone, error: deleteError } = await svc
    .from('jev_runs')
    .delete()
    .in('id', ids)
    .eq('mode', 'partial')
    .select('id');
  if (deleteError) throw new Error(`jev retention: ${deleteError.code ?? 'delete failed'}`);
  return { deleted: (gone ?? []).length, enabled: true };
}

/**
 * Archived legal records past retain_until: a kept evidence file goes first,
 * then the row. A row whose file could not be removed stays for the next run.
 */
export async function archiveRetentionSweep(svc: ServiceClient, now: Date): Promise<{ deleted: number }> {
  const { data, error } = await svc
    .from('filing_legal_record_archive')
    .select('id, storage_path')
    .lt('retain_until', now.toISOString())
    .order('retain_until', { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(`archive retention: ${error.code ?? 'read failed'}`);
  const rows = (data ?? []) as Array<{ id: string; storage_path: string | null }>;
  if (rows.length === 0) return { deleted: 0 };
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => typeof p === 'string' && p.length > 0);
  let ids = rows.map((r) => r.id);
  if (paths.length) {
    const { error: removeError } = await svc.storage.from(CLAIM_DOCUMENTS_BUCKET).remove(paths);
    if (removeError) ids = rows.filter((r) => !r.storage_path).map((r) => r.id);
  }
  if (ids.length === 0) return { deleted: 0 };
  const { data: gone, error: deleteError } = await svc.from('filing_legal_record_archive').delete().in('id', ids).select('id');
  if (deleteError) throw new Error(`archive retention: ${deleteError.code ?? 'delete failed'}`);
  return { deleted: (gone ?? []).length };
}
