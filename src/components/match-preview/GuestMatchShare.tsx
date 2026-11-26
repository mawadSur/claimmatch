'use client';

import { useState } from 'react';
import type { MatchPreviewDraft } from '@/lib/match-preview';
import { matchPreviewSharePath } from '@/lib/match-preview';

/**
 * Save-by-link for guest match results. The retired homepage email sign-up
 * is gone (POST /api/subscribe → 410), so this copies a URL that restores
 * the same answers without an account.
 */
export function GuestMatchShare({ draft }: { draft: MatchPreviewDraft }) {
  const [copied, setCopied] = useState(false);
  const href = matchPreviewSharePath(draft);

  async function copy() {
    const url = new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copy this link to keep your results', url);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-brand-50 px-4 py-3">
      <p className="text-sm font-semibold text-ink">Keep these results without an account</p>
      <p className="mt-1 text-sm text-ink-muted">
        Copy a private link that restores these answers on this device. We do not email match results unless you create an account and turn on alerts.
      </p>
      <button type="button" className="btn-secondary mt-3" onClick={copy}>
        {copied ? 'Link copied' : 'Copy results link'}
      </button>
    </div>
  );
}
