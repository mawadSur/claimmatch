'use client';

import { useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { MatchPreviewDraft } from '@/lib/match-preview';
import { matchPreviewSharePath } from '@/lib/match-preview';

/**
 * Save-by-link or one-shot email for guest match results. Email is
 * transactional only (no marketing opt-in). We never store the address.
 */
export function GuestMatchShare({ draft }: { draft: MatchPreviewDraft }) {
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const href = matchPreviewSharePath(draft);

  function capture(method: 'link' | 'email') {
    posthog?.capture(ANALYTICS_EVENTS.guest_match_saved, { method });
  }

  async function copy() {
    const url = new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      capture('link');
    } catch {
      window.prompt('Copy this link to keep your results', url);
      capture('link');
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/match-preview/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...draft }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStatus('error');
        setMessage(json?.error || 'We could not send that email. Copy the link instead.');
        return;
      }
      setStatus('sent');
      setMessage('Sent. Check your inbox — we will not email you again unless you create an account and turn on alerts.');
      capture('email');
    } catch {
      setStatus('error');
      setMessage('We could not reach Lawsuit AI. Copy the link instead.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-brand-50 px-4 py-3">
      <p className="text-sm font-semibold text-ink">Keep these results without an account</p>
      <p className="mt-1 text-sm text-ink-muted">
        Copy a private link that restores these answers, or email the list to yourself once. We do not add you to marketing.
      </p>
      <button type="button" className="btn-secondary mt-3" onClick={copy}>
        {copied ? 'Link copied' : 'Copy results link'}
      </button>
      <form onSubmit={sendEmail} className="mt-4 space-y-2">
        <label htmlFor="guest-match-email" className="field-label">
          Email results to yourself
        </label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <input
            id="guest-match-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== 'idle') setStatus('idle');
            }}
            className="field-input"
            placeholder="you@example.com"
            required
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Email results'}
          </button>
        </div>
        {message && (
          <p className={`text-sm ${status === 'error' ? 'text-danger-700' : 'text-ink-muted'}`}>{message}</p>
        )}
      </form>
    </div>
  );
}
