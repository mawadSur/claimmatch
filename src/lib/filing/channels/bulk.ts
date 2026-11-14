/**
 * administrator_bulk: the CSV of verified, individually signed claims in the
 * administrator's third-party-filer column layout (the channel config).
 * Staff upload it to the administrator's portal themselves; nothing here
 * talks to the administrator. The file is never stored: the batch row keeps
 * its SHA-256 and row count only. Pure.
 */
import type { CanonicalPacket } from '../v2/contract';
import type { BulkSource, ChannelConfigFor, FilingSpecContent } from '../v2/contract-spec';
import { packetPathText } from './packet-fields';

export interface BulkRowInput {
  jobId: string;
  claimId: string;
  packet: CanonicalPacket;
  spec: FilingSpecContent;
  signature: { id: string; typed_name: string; signed_at: string; packet_hash: string };
}

/** Spreadsheet formula injection: a cell that starts like a formula gets a leading apostrophe. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell (RFC 4180 quoting) that a spreadsheet will never run as a formula. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? '';
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sourceText(source: BulkSource, row: BulkRowInput): string {
  if ('path' in source) return packetPathText(row.packet, row.spec, source.path) ?? '';
  if ('signature' in source) {
    switch (source.signature) {
      case 'typed_name':
        return row.signature.typed_name;
      case 'signed_at':
        return row.signature.signed_at;
      case 'packet_hash':
        return row.signature.packet_hash;
      default:
        return row.signature.id;
    }
  }
  if ('claim' in source) return source.claim === 'claim_id' ? row.claimId : row.jobId;
  return source.constant;
}

export interface BulkCsv {
  csv: string;
  /** What filing_export_batches.columns stores: the layout, never values. */
  columns: Array<{ header: string; source: BulkSource }>;
}

/** The CSV for these rows, CRLF line ends, header first. */
export function buildBulkCsv(config: ChannelConfigFor<'administrator_bulk'>, rows: BulkRowInput[]): BulkCsv {
  const lines = [config.columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(config.columns.map((c) => csvCell(sourceText(c.source, row))).join(','));
  }
  return {
    csv: `${lines.join('\r\n')}\r\n`,
    columns: config.columns.map((c) => ({ header: c.header, source: c.source })),
  };
}

/** A download name with no member data: prefix, settlement slug, date, batch id. */
export function bulkFileName(prefix: string, lawsuitSlug: string, batchId: string, now: Date): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'settlement';
  return `${safe(prefix)}-${safe(lawsuitSlug)}-${now.toISOString().slice(0, 10)}-${batchId.slice(0, 8)}.csv`;
}
