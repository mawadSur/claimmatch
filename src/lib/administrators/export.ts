import { flags } from '@/lib/flags';

export interface AuthorizedClaimExportRow {
  claim_id: string;
  user_id: string;
  lawsuit_id: string;
  lawsuit_title: string;
  authorization_version: string;
  authorized_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  zip: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
}

const CSV_COLUMNS: Array<keyof AuthorizedClaimExportRow> = [
  'claim_id',
  'user_id',
  'lawsuit_id',
  'lawsuit_title',
  'authorization_version',
  'authorized_at',
  'full_name',
  'email',
  'phone',
  'state',
  'zip',
  'address_line1',
  'address_line2',
  'city',
];

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function authorizedClaimsToCsv(rows: AuthorizedClaimExportRow[]): string {
  const header = CSV_COLUMNS.join(',');
  const body = rows.map((row) => CSV_COLUMNS.map((key) => csvEscape(row[key])).join(','));
  return [header, ...body].join('\n');
}

export function authorizedClaimsToJson(rows: AuthorizedClaimExportRow[]): string {
  return JSON.stringify({ count: rows.length, claims: rows }, null, 2);
}

export function exportAuthorizedClaims(
  rows: AuthorizedClaimExportRow[],
  format: 'csv' | 'json',
  enabled = flags.directFiling(),
): { ok: true; body: string; contentType: string } | { ok: false; error: string } {
  if (!enabled) {
    return { ok: false, error: 'Direct filing export is turned off.' };
  }
  if (format === 'json') {
    return { ok: true, body: authorizedClaimsToJson(rows), contentType: 'application/json; charset=utf-8' };
  }
  return { ok: true, body: authorizedClaimsToCsv(rows), contentType: 'text/csv; charset=utf-8' };
}
