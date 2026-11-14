/**
 * Member proof uploads: storage paths, the real file type (magic bytes, never
 * the client's word) and the member's view of a document row. Pure.
 */
import type { DocumentMime } from './contract-spec';
import type { DocumentView } from './contract';

const EXTENSIONS: Readonly<Record<DocumentMime, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** {user_id}/{claim_id}/{document_id}.{ext}: members may read it (0037), never .../evidence/. */
export function memberDocumentPath(userId: string, claimId: string, documentId: string, mime: DocumentMime): string {
  return `${userId}/${claimId}/${documentId}.${EXTENSIONS[mime]}`;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return '';
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);

/** The file type its first bytes show, or null when it is none of the accepted types. */
export function sniffDocumentMime(bytes: Uint8Array): DocumentMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return 'image/png';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    if (HEIF_BRANDS.has(brand)) return 'image/heif';
    return null;
  }
  // A PDF header may follow a little junk; readers accept it in the first 1,024 bytes.
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  if (head.includes('%PDF-')) return 'application/pdf';
  return null;
}

/** HEIC and HEIF are one container family; phones label the same file either way. */
export function mimeMatches(declared: string, actual: DocumentMime | null): boolean {
  if (!actual) return false;
  if (declared === actual) return true;
  const heif = new Set(['image/heic', 'image/heif']);
  return heif.has(declared) && heif.has(actual);
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface DocumentRecord {
  id: string;
  claim_id: string;
  user_id: string;
  packet_id: string | null;
  source: string;
  kind: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  sha256: string | null;
  status: string;
  health_flag: boolean;
  upload_expires_at: string | null;
  stored_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
}

export const DOCUMENT_COLUMNS =
  'id, claim_id, user_id, packet_id, source, kind, storage_path, mime, size_bytes, sha256, status, health_flag, upload_expires_at, stored_at, deleted_at, created_at';

export function toDocumentRecord(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id ?? ''),
    claim_id: String(row.claim_id ?? ''),
    user_id: String(row.user_id ?? ''),
    packet_id: typeof row.packet_id === 'string' ? row.packet_id : null,
    source: String(row.source ?? ''),
    kind: String(row.kind ?? ''),
    storage_path: String(row.storage_path ?? ''),
    mime: String(row.mime ?? ''),
    size_bytes: Number(row.size_bytes ?? 0),
    sha256: typeof row.sha256 === 'string' ? row.sha256 : null,
    status: String(row.status ?? ''),
    health_flag: row.health_flag === true,
    upload_expires_at: iso(row.upload_expires_at),
    stored_at: iso(row.stored_at),
    deleted_at: iso(row.deleted_at),
    created_at: iso(row.created_at),
  };
}

/** The member's view of one of their uploads (never the storage path). */
export function toDocumentView(doc: DocumentRecord, now: Date): DocumentView {
  return {
    id: doc.id,
    kind: doc.kind,
    status: doc.status as DocumentView['status'],
    mime: doc.mime as DocumentView['mime'],
    size_bytes: doc.size_bytes,
    sha256: doc.sha256,
    created_at: doc.created_at ?? now.toISOString(),
    stored_at: doc.stored_at,
  };
}
