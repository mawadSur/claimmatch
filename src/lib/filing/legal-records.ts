/**
 * One-click legal records on account deletion (go-live checklist item 8,
 * docs/legal/retention-schedule.md). ONE setting decides what happens to a
 * deleted account's signatures, signature voids, e-sign consents, filing jobs
 * and staff evidence screenshots:
 *
 *   delete                (default, today's behavior) they go with the account.
 *   anonymize_and_retain  a copy without the member's identity is kept in
 *                         filing_legal_record_archive (0045): no name, address,
 *                         answers, IP, user agent, session, account or claim
 *                         id; evidence keeps its hash and size, the file goes.
 *   retain                the full rows are kept there, and evidence files stay
 *                         in claim-documents until retain_until.
 *
 * Set by LEGAL_RECORDS_ON_ACCOUNT_DELETION (Vercel env) only after the law
 * firm decides and the Privacy page says so. Any other value reads as delete.
 * Archived rows are kept LEGAL_RECORD_RETENTION_DAYS (default 2555, about
 * seven years, a placeholder for counsel), then the cron deletes them.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

export const LEGAL_RECORD_MODES = ['delete', 'anonymize_and_retain', 'retain'] as const;
export type LegalRecordMode = (typeof LEGAL_RECORD_MODES)[number];
export type ArchiveMode = Exclude<LegalRecordMode, 'delete'>;

export const LEGAL_RECORD_KINDS = [
  'claim_signature',
  'claim_signature_void',
  'esign_consent',
  'claim_filing_job',
  'filing_evidence',
] as const;
export type LegalRecordKind = (typeof LEGAL_RECORD_KINDS)[number];

/** Placeholder default for counsel: about seven years. */
export const DEFAULT_LEGAL_RECORD_RETENTION_DAYS = 2555;
const MAX_RETENTION_DAYS = 36_500;
const DAY_MS = 86_400_000;
const READ_LIMIT = 5000;
const INSERT_CHUNK = 200;

export function legalRecordsMode(env: Record<string, string | undefined> = process.env): LegalRecordMode {
  const value = env.LEGAL_RECORDS_ON_ACCOUNT_DELETION?.trim();
  return (LEGAL_RECORD_MODES as readonly string[]).includes(value ?? '') ? (value as LegalRecordMode) : 'delete';
}

/** A whole number of days in range, or the default. */
export function retentionDaysFromEnv(raw: string | undefined, fallback: number, max = MAX_RETENTION_DAYS): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
  const days = Number(raw.trim());
  return days >= 1 && days <= max ? days : fallback;
}

export function legalRecordRetentionDays(env: Record<string, string | undefined> = process.env): number {
  return retentionDaysFromEnv(env.LEGAL_RECORD_RETENTION_DAYS, DEFAULT_LEGAL_RECORD_RETENTION_DAYS);
}

/**
 * What anonymize_and_retain keeps of each record: what was agreed and when,
 * never who. Everything else (typed name, signed packet text with the
 * member's details and answers, IP, user agent, session, account, claim and
 * packet ids, confirmation numbers, staff results) is left out.
 */
export const ANONYMIZED_FIELDS: Readonly<Record<LegalRecordKind, readonly string[]>> = {
  claim_signature: [
    'id', 'lawsuit_id', 'spec_id', 'spec_version', 'packet_hash', 'statement_text', 'statement_sha256',
    'authorization_text_version', 'authorization_text', 'lane', 'esign_consent_id', 'auth_method', 'auth_time',
    'jev_run_id', 'signed_at',
  ],
  claim_signature_void: ['id', 'signature_id', 'reason', 'actor', 'created_at'],
  esign_consent: ['id', 'text_version', 'full_text', 'text_sha256', 'consented_at', 'withdrawn_at'],
  claim_filing_job: [
    'id', 'lawsuit_id', 'signature_id', 'packet_hash', 'policy_id', 'spec_id', 'channel', 'status', 'attempt',
    'needs_attention_reason', 'closed_reason', 'filed_at', 'closed_at', 'created_at',
  ],
  filing_evidence: ['id', 'job_id', 'kind', 'mime', 'size_bytes', 'sha256', 'stored_at', 'created_at'],
};

/** JSON with sorted keys, so the same record always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Row)
      .sort()
      .filter((k) => (value as Row)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Row)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function pickFields(row: Row, fields: readonly string[]): Row {
  const out: Row = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

export interface ArchiveRow {
  deletion_ref: string;
  mode: ArchiveMode;
  record_kind: LegalRecordKind;
  source_id: string;
  lawsuit_id: string | null;
  record: Row;
  record_sha256: string;
  storage_path: string | null;
  archived_at: string;
  retain_until: string;
}

/** One archive row for one source row. Pure. */
export function archiveRowFor(
  kind: LegalRecordKind,
  row: Row,
  opts: { mode: ArchiveMode; deletionRef: string; now: Date; retentionDays: number },
): ArchiveRow {
  const record = opts.mode === 'retain' ? { ...row } : pickFields(row, ANONYMIZED_FIELDS[kind]);
  const path = kind === 'filing_evidence' && opts.mode === 'retain' && typeof row.storage_path === 'string' ? row.storage_path : null;
  return {
    deletion_ref: opts.deletionRef,
    mode: opts.mode,
    record_kind: kind,
    source_id: String(row.id),
    lawsuit_id: typeof row.lawsuit_id === 'string' ? row.lawsuit_id : null,
    record,
    record_sha256: createHash('sha256').update(canonicalJson(record), 'utf8').digest('hex'),
    storage_path: path,
    archived_at: opts.now.toISOString(),
    retain_until: new Date(opts.now.getTime() + opts.retentionDays * DAY_MS).toISOString(),
  };
}

export type ArchiveOutcome =
  | { ok: true; archived: number; keptPaths: string[] }
  | { ok: false; step: string };

const SOURCES: ReadonlyArray<{ kind: LegalRecordKind; table: string; evidence?: boolean }> = [
  { kind: 'claim_signature', table: 'claim_signatures' },
  { kind: 'claim_signature_void', table: 'claim_signature_voids' },
  { kind: 'esign_consent', table: 'esign_consents' },
  { kind: 'claim_filing_job', table: 'claim_filing_jobs' },
  { kind: 'filing_evidence', table: 'claim_documents', evidence: true },
];

/**
 * Copies the account's legal records into the archive before the account is
 * deleted. Fails closed: any read or write error returns ok false, and the
 * caller must not delete the account (the records would be lost). Safe to
 * run twice: a record already archived is skipped.
 */
export async function archiveLegalRecords(
  svc: ServiceClient,
  userId: string,
  mode: ArchiveMode,
  now: Date,
  retentionDays = legalRecordRetentionDays(),
): Promise<ArchiveOutcome> {
  const deletionRef = randomUUID();
  const rows: ArchiveRow[] = [];
  for (const source of SOURCES) {
    let query = svc.from(source.table).select('*').eq('user_id', userId);
    if (source.evidence) query = query.eq('source', 'staff_evidence').eq('status', 'stored');
    const { data, error } = await query.limit(READ_LIMIT);
    if (error) return { ok: false, step: source.table };
    for (const row of (data ?? []) as Row[]) {
      rows.push(archiveRowFor(source.kind, row, { mode, deletionRef, now, retentionDays }));
    }
  }
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await svc
      .from('filing_legal_record_archive')
      .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'record_kind,source_id', ignoreDuplicates: true });
    if (error) return { ok: false, step: 'filing_legal_record_archive' };
  }
  const keptPaths = rows.map((r) => r.storage_path).filter((p): p is string => typeof p === 'string');
  return { ok: true, archived: rows.length, keptPaths };
}
