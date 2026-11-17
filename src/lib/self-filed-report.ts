/**
 * "I filed this myself": the user marked a claim as filed on the official
 * site. Optional confirmation number (stored on the claim, as today) and
 * optional confirmation screenshot in a private bucket.
 *
 * UI and writes stay off until SELF_FILED_REPORT_ENABLED=1. The claim row
 * still uses reported_filed / submitted so the existing timeline and
 * scorecard count it.
 */

export const SELF_FILED_CONFIRMATIONS_BUCKET = 'self-filed-confirmations';

export const SELF_FILED_MAX_BYTES = 10 * 1024 * 1024;

export const SELF_FILED_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
] as const;

export type SelfFiledMime = (typeof SELF_FILED_ALLOWED_MIME)[number];

const MIME_EXT: Record<SelfFiledMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface SelfFiledReportRow {
  id: string;
  user_id: string;
  lawsuit_id: string;
  claim_id: string;
  confirmation_number: string | null;
  confirmation_storage_path: string | null;
  confirmation_mime: string | null;
  confirmation_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface SelfFiledReportView {
  id: string;
  lawsuitId: string;
  claimId: string;
  hasScreenshot: boolean;
  screenshotMime: string | null;
  screenshotBytes: number | null;
}

export function isSelfFiledMime(value: unknown): value is SelfFiledMime {
  return typeof value === 'string' && (SELF_FILED_ALLOWED_MIME as readonly string[]).includes(value);
}

export function selfFiledExtension(mime: SelfFiledMime): string {
  return MIME_EXT[mime];
}

export function selfFiledStoragePath(userId: string, reportId: string, mime: SelfFiledMime): string {
  return `${userId}/${reportId}/confirmation.${selfFiledExtension(mime)}`;
}

export function parseSelfFiledMime(value: unknown): { ok: true; mime: SelfFiledMime } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: 'Choose an image or PDF of the confirmation.' };
  }
  const mime = value.trim().toLowerCase();
  if (!isSelfFiledMime(mime)) {
    return { ok: false, error: 'Use a JPEG, PNG, HEIC, WebP, or PDF file.' };
  }
  return { ok: true, mime };
}

export function parseSelfFiledBytes(
  value: unknown,
): { ok: true; bytes: number } | { ok: false; error: string } {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'That file looks empty.' };
  }
  if (n > SELF_FILED_MAX_BYTES) {
    return { ok: false, error: 'That file is larger than 10 MB.' };
  }
  return { ok: true, bytes: n };
}

export function toSelfFiledReportView(row: {
  id: string;
  lawsuit_id: string;
  claim_id: string;
  confirmation_storage_path?: string | null;
  confirmation_mime?: string | null;
  confirmation_bytes?: number | null;
}): SelfFiledReportView {
  const path = typeof row.confirmation_storage_path === 'string' ? row.confirmation_storage_path.trim() : '';
  return {
    id: row.id,
    lawsuitId: row.lawsuit_id,
    claimId: row.claim_id,
    hasScreenshot: path.length > 0,
    screenshotMime: row.confirmation_mime ?? null,
    screenshotBytes: row.confirmation_bytes ?? null,
  };
}

export function screenshotLabel(view: Pick<SelfFiledReportView, 'screenshotMime' | 'screenshotBytes'>): string {
  const kind =
    view.screenshotMime === 'application/pdf'
      ? 'PDF'
      : view.screenshotMime?.startsWith('image/')
        ? 'image'
        : 'file';
  if (typeof view.screenshotBytes === 'number' && view.screenshotBytes > 0) {
    if (view.screenshotBytes < 1024) return `Confirmation screenshot on file (${kind}, ${view.screenshotBytes} bytes)`;
    const kb = Math.max(1, Math.round(view.screenshotBytes / 1024));
    return `Confirmation screenshot on file (${kind}, ${kb} KB)`;
  }
  return `Confirmation screenshot on file (${kind})`;
}
