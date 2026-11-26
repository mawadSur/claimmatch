'use client';

import { useState } from 'react';
import { noticeRequestLetter, type NoticeRequestInput } from '@/lib/notice-request';

/**
 * Copy or download a pre-filled request. We never send the email ourselves.
 */
export function NoticeRequestLetter({
  title,
  slug,
  administrator,
  officialHref,
}: Omit<NoticeRequestInput, 'senderName'>) {
  const [copied, setCopied] = useState(false);
  const letter = noticeRequestLetter({ title, slug, administrator, officialHref });

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${letter.subject}\n\n${letter.body}`);
      setCopied(true);
    } catch {
      window.prompt('Copy this request', `${letter.subject}\n\n${letter.body}`);
    }
  }

  function download() {
    const blob = new Blob([`${letter.subject}\n\n${letter.body}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = letter.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Copy or download this request and send it yourself to {letter.administratorLabel}
        {letter.contactEmail ? ` (${letter.contactEmail})` : ''}. Lawsuit AI does not send this email.
      </p>
      <label className="field-label" htmlFor={`notice-request-subject-${slug}`}>
        Subject
      </label>
      <input
        id={`notice-request-subject-${slug}`}
        readOnly
        value={letter.subject}
        className="field-input"
      />
      <label className="field-label" htmlFor={`notice-request-body-${slug}`}>
        Message
      </label>
      <textarea
        id={`notice-request-body-${slug}`}
        readOnly
        rows={12}
        value={letter.body}
        className="field-input min-h-[12rem] font-mono text-sm"
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy request'}
        </button>
        <button type="button" className="btn-secondary" onClick={download}>
          Download .txt
        </button>
        {letter.mailtoHref && (
          <a href={letter.mailtoHref} className="btn-secondary">
            Open in your email app
          </a>
        )}
      </div>
    </div>
  );
}
