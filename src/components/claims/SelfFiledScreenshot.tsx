'use client';

import { useId, useState } from 'react';
import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { ClaimError, type ClaimErrorState } from './ClaimError';
import {
  SELF_FILED_ALLOWED_MIME,
  SELF_FILED_MAX_BYTES,
  screenshotLabel,
  type SelfFiledReportView,
} from '@/lib/self-filed-report';

const ACCEPT = SELF_FILED_ALLOWED_MIME.join(',');

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 401) return 'You were logged out.';
  return json?.error || 'Something went wrong. Please try again.';
}

/**
 * Optional confirmation screenshot for a saved self-filed report. Image or PDF,
 * 10 MB max, private bucket. The user can delete their upload.
 */
export function SelfFiledScreenshot({
  report: initial,
  onChange,
}: {
  report: SelfFiledReportView;
  onChange?: (report: SelfFiledReportView) => void;
}) {
  const id = useId();
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState<'upload' | 'delete' | null>(null);
  const [error, setError] = useState<ClaimErrorState | null>(null);

  function apply(next: SelfFiledReportView) {
    setReport(next);
    onChange?.(next);
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > SELF_FILED_MAX_BYTES) {
      setError({ message: 'That file is larger than 10 MB.' });
      return;
    }
    setBusy('upload');
    try {
      const slotRes = await fetch(`/api/self-filed-reports/${encodeURIComponent(report.id)}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, bytes: file.size }),
      });
      if (!slotRes.ok) {
        setError({ message: await readError(slotRes), status: slotRes.status });
        return;
      }
      const slot = (await slotRes.json()) as {
        report: SelfFiledReportView;
        upload?: { signed_url?: string };
      };
      const signed = slot.upload?.signed_url;
      if (!signed) {
        setError({ message: 'Could not start that upload just now.' });
        return;
      }
      const put = await fetch(signed, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) {
        setError({ message: 'The screenshot did not upload. Try a smaller image or PDF.' });
        return;
      }
      apply(slot.report);
    } catch {
      setError({ message: "We couldn't reach Lawsuit AI. Check your internet connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy('delete');
    try {
      const res = await fetch(`/api/self-filed-reports/${encodeURIComponent(report.id)}/screenshot`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError({ message: await readError(res), status: res.status });
        return;
      }
      const json = (await res.json()) as { report: SelfFiledReportView };
      apply(json.report);
    } catch {
      setError({ message: "We couldn't reach Lawsuit AI. Check your internet connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">Confirmation screenshot</p>
      <p className="text-xs leading-relaxed text-ink-muted">
        Optional. JPEG, PNG, HEIC, WebP, or PDF, up to 10 MB. Only you and Lawsuit AI staff can see it.
      </p>
      {report.hasScreenshot ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Paperclip className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
            {screenshotLabel(report)}
          </p>
          <button type="button" className="btn-ghost self-start" onClick={remove} disabled={busy !== null}>
            {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            Delete upload
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor={id} className="btn-secondary inline-flex cursor-pointer">
            {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
            {busy === 'upload' ? 'Uploading…' : 'Add screenshot'}
          </label>
          <input
            id={id}
            type="file"
            className="sr-only"
            accept={ACCEPT}
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
        </div>
      )}
      <ClaimError error={error} />
    </div>
  );
}
