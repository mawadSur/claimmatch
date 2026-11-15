/**
 * The one-click filing part of the account data export (GET
 * /api/account/export, design section 12): the member's own packets,
 * uploaded documents (metadata only, never the file bytes or the storage
 * path), signatures, signature voids, e-sign consents and the status of
 * their filing jobs.
 *
 * Member-safe only. Never: staff identities or lock owners, staff notes or
 * reason codes (needs_attention_reason, closed_reason, result, evidence), Jev
 * results (jev_result can hold staff-audience issues), staff evidence
 * uploads, session ids or the test mark.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Columns read for each table. Lists, never '*', so a new staff column never leaks. */
export const EXPORT_COLUMNS = {
  claim_packets:
    'id, claim_id, lawsuit_id, status, revision, spec_version, answers, member_snapshot, benefit_tier, payout_method, class_definition_confirmed_at, health_consent_at, packet_hash, signed_at, created_at, updated_at',
  claim_documents: 'id, claim_id, packet_id, kind, mime, size_bytes, sha256, status, stored_at, deleted_at, delete_reason, created_at',
  claim_signatures:
    'id, claim_id, lawsuit_id, packet_id, spec_version, packet_hash, packet_canonical, statement_text, authorization_text_version, authorization_text, typed_name, lane, auth_method, auth_time, ip, user_agent, signed_at',
  claim_signature_voids: 'id, signature_id, claim_id, reason, actor, created_at',
  esign_consents: 'id, text_version, full_text, context_claim_id, ip, user_agent, consented_at, withdrawn_at',
  claim_filing_jobs: 'id, claim_id, lawsuit_id, channel, status, confirmation_number, due_by, filed_at, closed_at, created_at, updated_at',
} as const;

export type ExportTable = keyof typeof EXPORT_COLUMNS;
type Row = Record<string, unknown>;

export interface OneClickExport {
  packets: Row[];
  documents: Row[];
  signatures: Row[];
  signature_voids: Row[];
  esign_consents: Row[];
  filing_jobs: Row[];
}

/** Keeps only the listed columns of each row, whatever the database returned. */
export function pickColumns(table: ExportTable, rows: readonly unknown[] | null | undefined): Row[] {
  const columns = EXPORT_COLUMNS[table].split(',').map((c) => c.trim());
  return (rows ?? []).map((row) => {
    const source = (row ?? {}) as Row;
    const out: Row = {};
    for (const column of columns) out[column] = source[column] ?? null;
    return out;
  });
}

export type OneClickExportResult = { ok: true; data: OneClickExport } | { ok: false };

/**
 * Reads the member's one-click records. `member` is the member's own client
 * (row-level security: their rows only, member uploads only); `service` reads
 * claim_filing_jobs, which members cannot read, filtered to this user and to
 * EXPORT_COLUMNS. Any failed read fails the whole section, so an export is
 * never silently missing records.
 */
export async function loadOneClickExport(args: {
  member: SupabaseClient;
  service: SupabaseClient;
  userId: string;
}): Promise<OneClickExportResult> {
  const { member, service, userId } = args;
  type Read = PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  const read = (client: SupabaseClient, table: ExportTable, extra?: [string, string]): Read => {
    const columns: string = EXPORT_COLUMNS[table];
    const query = client.from(table as string).select(columns).eq('user_id', userId);
    return extra ? query.eq(extra[0], extra[1]) : query;
  };
  const results = await Promise.all([
    read(member, 'claim_packets'),
    read(member, 'claim_documents', ['source', 'member']),
    read(member, 'claim_signatures'),
    read(member, 'claim_signature_voids'),
    read(member, 'esign_consents'),
    read(service, 'claim_filing_jobs'),
  ]);
  if (results.some((r) => r.error)) {
    console.error('[account/export] one-click read failed', { codes: results.map((r) => r.error?.code ?? null) });
    return { ok: false };
  }
  const [packets, documents, signatures, voids, consents, jobs] = results.map((r) => r.data as unknown[] | null);
  return {
    ok: true,
    data: {
      packets: pickColumns('claim_packets', packets),
      documents: pickColumns('claim_documents', documents),
      signatures: pickColumns('claim_signatures', signatures),
      signature_voids: pickColumns('claim_signature_voids', voids),
      esign_consents: pickColumns('esign_consents', consents),
      filing_jobs: pickColumns('claim_filing_jobs', jobs),
    },
  };
}
