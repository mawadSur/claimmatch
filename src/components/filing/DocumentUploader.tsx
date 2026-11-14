'use client';

import { useRef, useState } from 'react';
import { Camera, FileUp, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { DocumentMime, DocumentView, FilingErrorBody, PacketItemView } from '@/lib/filing/v2/contract';
import {
  completeDocument,
  createDocumentSlot,
  deleteDocument,
  documentDownload,
  uploadToSignedUrl,
} from './filing-api';
import { acceptAttribute, fileProblem, formatBytes, guessMime, itemDomId } from './packet-form';
import { FieldError, FieldIssues, describedBy } from './ui';

const COPY = ONE_CLICK_COPY.docs;

/** One file on its way: the slot is kept so "Try again" re-sends to it while it is valid. */
interface Upload {
  key: number;
  file: File;
  mime: DocumentMime;
  phase: 'uploading' | 'checking' | 'failed';
  percent: number;
  slot: { id: string; url: string; expiresAt: string } | null;
  error: string | null;
}

const STATUS_TEXT: Record<DocumentView['status'], string> = {
  stored: COPY.stored,
  pending_upload: COPY.pending,
  rejected: COPY.rejected,
  deleted: COPY.rejected,
};

/**
 * Proof uploads for one packet item: take a photo (the phone's camera) or
 * choose a file, with progress, retry and remove. Bytes go straight to
 * Storage through a server-issued signed URL; the server then checks the
 * real type and size and hashes the file. File names are never sent.
 */
export function DocumentUploader({
  item,
  claimId,
  disabled,
  error,
  onChanged,
}: {
  item: PacketItemView;
  claimId: string;
  disabled: boolean;
  /** A server error placed on this item (e.g. a required proof missing). */
  error: string | null;
  /** Called after a file is stored or removed, so the view (and Jev's hints) refresh. */
  onChanged: (message: string) => Promise<void>;
}) {
  const proof = item.proof;
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const nextKey = useRef(1);
  if (!proof) return null;

  const id = itemDomId(item.path);
  const documents = proof.documents.filter((d) => d.status !== 'deleted');
  const storedCount = documents.filter((d) => d.status === 'stored').length;
  const full = storedCount + uploads.filter((u) => u.phase !== 'failed').length >= proof.max_files;
  const locked = item.locked !== null;
  const off = disabled || locked;
  /** The camera is offered only when the item takes photos. */
  const photos = proof.accepted_mime.some((mime) => mime.startsWith('image/'));
  const issuesId = item.issues.length ? `${id}-issues` : null;
  const errorId = error || problem ? `${id}-error` : null;

  const patch = (key: number, next: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...next } : u)));

  const describe = (e: FilingErrorBody) => e.error;

  async function send(upload: Upload) {
    let slot = upload.slot;
    if (!slot || Date.parse(slot.expiresAt) <= Date.now() + 60_000) {
      const created = await createDocumentSlot(claimId, { kind: item.path.slice('documents.'.length), mime: upload.mime, size_bytes: upload.file.size });
      if (!created.ok) return patch(upload.key, { phase: 'failed', error: describe(created.error) });
      slot = { id: created.data.document.id, url: created.data.upload.signed_url, expiresAt: created.data.upload.expires_at };
      patch(upload.key, { slot });
    }
    patch(upload.key, { phase: 'uploading', percent: 0, error: null });
    const put = await uploadToSignedUrl(slot.url, upload.file, upload.mime, (percent) => patch(upload.key, { percent }));
    if (!put.ok) return patch(upload.key, { phase: 'failed', error: COPY.failed });
    patch(upload.key, { phase: 'checking', percent: 100 });
    const done = await completeDocument(claimId, slot.id);
    if (!done.ok) {
      // A file the server refused is deleted there; a new attempt needs a new slot.
      const refused = done.error.code === 'document_invalid';
      return patch(upload.key, { phase: 'failed', error: describe(done.error), slot: refused ? null : slot });
    }
    setUploads((list) => list.filter((u) => u.key !== upload.key));
    await onChanged(COPY.stored);
  }

  function pick(files: FileList | null) {
    setProblem(null);
    const file = files?.[0];
    if (!file) return;
    const issue = fileProblem(file, proof!.accepted_mime);
    const mime = guessMime(file);
    if (issue || !mime) return setProblem(issue ?? COPY.wrongType);
    if (full) return setProblem(COPY.full);
    const upload: Upload = { key: nextKey.current++, file, mime, phase: 'uploading', percent: 0, slot: null, error: null };
    setUploads((list) => [...list, upload]);
    void send(upload);
  }

  async function discard(upload: Upload) {
    setUploads((list) => list.filter((u) => u.key !== upload.key));
    if (upload.slot) await deleteDocument(claimId, upload.slot.id);
  }

  async function remove(document: DocumentView) {
    setRemoving(document.id);
    const result = await deleteDocument(claimId, document.id);
    setRemoving(null);
    if (!result.ok) return setProblem(describe(result.error));
    await onChanged('');
  }

  async function open(document: DocumentView) {
    // Open the tab now (inside the tap) so it isn't blocked, then point it at the short-lived link.
    const tab = window.open('', '_blank');
    const result = await documentDownload(claimId, document.id);
    if (!result.ok) {
      tab?.close();
      return setProblem(describe(result.error));
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.url;
    }
  }

  const button = 'btn-secondary relative cursor-pointer !px-4 !py-2 text-sm focus-within:ring-2 focus-within:ring-brand-400';
  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={describedBy(issuesId, errorId)} className="focus:outline-none">
      <legend className="field-label">
        <span className="whitespace-pre-line">{item.label}</span>{' '}
        <span className="font-normal text-ink-muted">({item.required ? ONE_CLICK_COPY.need.required : ONE_CLICK_COPY.need.optional})</span>
      </legend>
      {item.help && <p className="mb-1.5 text-sm leading-relaxed text-ink-muted">{item.help}</p>}
      <p className="text-sm text-ink-muted">
        {COPY.types} {COPY.count(storedCount, proof.max_files)}
      </p>
      {item.locked && <p className="mt-1.5 text-sm text-ink-muted">{ONE_CLICK_COPY.need.locked[item.locked]}</p>}

      {documents.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
          {documents.map((document, i) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-ink">
                {COPY.file(i + 1, formatBytes(document.size_bytes))} · <span className="text-ink-muted">{STATUS_TEXT[document.status]}</span>
              </span>
              <span className="flex gap-2">
                {document.status === 'stored' && (
                  <button type="button" className="btn-ghost !min-h-tap !px-3 !py-2 text-sm" onClick={() => open(document)}>
                    {COPY.view}
                  </button>
                )}
                {!locked && (
                  <button
                    type="button"
                    className="btn-ghost !min-h-tap !px-3 !py-2 text-sm"
                    onClick={() => remove(document)}
                    disabled={off || removing === document.id}
                    aria-label={`${COPY.remove}: ${COPY.file(i + 1, formatBytes(document.size_bytes))}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {COPY.remove}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {uploads.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {uploads.map((upload) => (
            <li key={upload.key} className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm">
              {upload.phase === 'failed' ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-danger-700">{upload.error ?? COPY.failed}</span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => void send(upload)} disabled={off}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      {COPY.retry}
                    </button>
                    <button type="button" className="btn-ghost !px-3 !py-2 text-sm" onClick={() => void discard(upload)}>
                      {COPY.remove}
                    </button>
                  </span>
                </div>
              ) : (
                <div>
                  <p className="flex items-center gap-2 text-ink">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {upload.phase === 'checking' ? COPY.checking : COPY.uploading(upload.percent)}
                  </p>
                  <progress className="mt-2 h-2 w-full" max={100} value={upload.percent} aria-label={COPY.uploading(upload.percent)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && !full && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos && (
            <label className={button}>
              <Camera className="h-4 w-4" aria-hidden />
              {COPY.takePhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={off}
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <label className={button}>
            <FileUp className="h-4 w-4" aria-hidden />
            {COPY.chooseFile}
            <input
              type="file"
              accept={acceptAttribute(proof.accepted_mime)}
              className="sr-only"
              disabled={off}
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {full && !locked && <p className="mt-2 text-sm text-ink-muted">{COPY.full}</p>}
      <FieldIssues id={issuesId ?? `${id}-issues`} issues={item.issues} />
      <FieldError id={errorId ?? `${id}-error`} message={problem ?? error} />
    </fieldset>
  );
}
