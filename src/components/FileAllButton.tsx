'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  CheckCircle2,
  FileSignature,
  X,
  AlertCircle,
  LogIn,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import type { Lawsuit } from '@/lib/types';
import { estimateTotalOwed, formatUSD } from '@/lib/recovery';
import { SERVICES_AGREEMENT } from '@/lib/services-agreement';

type Match = { lawsuit: Lawsuit; reasons?: string[] };
type Phase = 'idle' | 'loading' | 'success' | 'error' | 'unauth';
type Receipt = { slug: string; receipt_number: number; claim_url: string | null };

/**
 * One-click "prepare everything you're owed" action. Shows the count + estimated
 * total, then a single confirmation modal (typed legal name + accuracy checkbox
 * referencing the services agreement) that POSTs /api/claims/file-all. This
 * pre-fills each eligible claim and returns the official administrator links —
 * the user reviews and submits each claim themselves on the official site.
 */
export function FileAllButton({
  matches,
  defaultName,
}: {
  matches: Match[];
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [authorized, setAuthorized] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [filedCount, setFiledCount] = useState(0);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const count = matches.length;
  const total = formatUSD(estimateTotalOwed(matches));
  const canSubmit = authorized && name.trim().length >= 2 && phase !== 'loading';

  function closeModal() {
    if (phase === 'loading') return;
    setOpen(false);
    // Reset transient state so a re-open starts clean (but keep success view
    // out — success is shown inline after refresh).
    if (phase === 'error' || phase === 'unauth') setPhase('idle');
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('loading');
    setError('');
    try {
      const res = await fetch('/api/claims/file-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_name: name.trim() }),
      });

      if (res.status === 401) {
        setPhase('unauth');
        return;
      }

      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setFiledCount(typeof json.filed === 'number' ? json.filed : 0);
        setReceipts(Array.isArray(json.receipts) ? json.receipts : []);
        setPhase('success');
        router.refresh();
      } else {
        setError(json?.error || 'Something went wrong. Please try again.');
        setPhase('error');
      }
    } catch {
      setError('Network error — please try again.');
      setPhase('error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(defaultName);
          setAuthorized(false);
          setPhase('idle');
          setError('');
          setOpen(true);
        }}
        disabled={count === 0}
        className="btn-primary w-full justify-center sm:w-auto"
      >
        <FileSignature className="h-4 w-4" />
        {count === 0 ? 'No claims to prepare' : `Prepare all ${count} claim${count === 1 ? '' : 's'}`}
        {count > 0 && (
          <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Prepare your claims"
          onClick={closeModal}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-card sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-bold">
                  Prepare {count} claim{count === 1 ? '' : 's'}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Estimated total you could recover:{' '}
                  <span className="font-semibold text-brand-700">{total}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={phase === 'loading'}
                className="btn-ghost -mr-2 -mt-1 p-2"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {phase === 'success' ? (
              // Success view -------------------------------------------------
              <div className="flex flex-col items-center p-8 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-extrabold">
                  Prepared {filedCount} claim{filedCount === 1 ? '' : 's'}
                </h3>
                <p className="mt-2 max-w-sm text-sm text-ink-muted">
                  {filedCount > 0
                    ? 'Your details are pre-filled. Open each official form to review and submit — you file directly with the administrator.'
                    : 'Everything eligible was already prepared — you’re all caught up.'}
                </p>
                {receipts.some((r) => r.claim_url) && (
                  <ul className="mt-5 w-full space-y-2 text-left">
                    {receipts
                      .filter((r) => r.claim_url)
                      .map((r) => (
                        <li key={r.slug}>
                          <a
                            href={r.claim_url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                          >
                            <span className="truncate">Open official form · {r.slug}</span>
                            <ExternalLink className="h-4 w-4 shrink-0" />
                          </a>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link href="/dashboard" className="btn-primary justify-center">
                    Go to your dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setPhase('idle');
                    }}
                    className="btn-secondary justify-center"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              // Agreement + sign form ---------------------------------------
              <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="mb-4 flex items-start gap-2 rounded-xl bg-brand-50/70 p-3 text-xs text-ink-muted">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    <span>
                      It’s free, and ClaimMatch never takes a cut of your
                      settlement. We pre-fill each claim and link you to the
                      official site, where you review and submit it yourself.
                    </span>
                  </div>

                  <label className="field-label">How ClaimMatch works</label>
                  <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-ink-muted">
                    {SERVICES_AGREEMENT}
                  </div>

                  <div className="mt-5">
                    <label className="field-label" htmlFor="fileall-signature">
                      Type your full legal name to sign
                    </label>
                    <input
                      id="fileall-signature"
                      type="text"
                      autoComplete="name"
                      required
                      className="field-input"
                      placeholder="e.g. Jordan A. Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <label className="mt-4 flex items-start gap-3 rounded-xl bg-gray-50 p-4">
                    <input
                      type="checkbox"
                      checked={authorized}
                      onChange={(e) => setAuthorized(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <span className="text-sm text-ink-muted">
                      I confirm my details are accurate and understand I’ll
                      review and submit each claim myself on the official site.
                    </span>
                  </label>

                  {phase === 'unauth' && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger-50 p-4 text-sm text-danger-700">
                      <LogIn className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Your session expired.{' '}
                        <Link href="/login?next=/dashboard" className="font-semibold underline">
                          Log in again
                        </Link>{' '}
                        to file your claims.
                      </span>
                    </div>
                  )}

                  {phase === 'error' && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger-50 p-4 text-sm text-danger-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 p-5">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="btn-primary w-full justify-center"
                  >
                    {phase === 'loading' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing your
                        claims…
                      </>
                    ) : (
                      <>
                        <FileSignature className="h-4 w-4" /> Prepare all{' '}
                        {count} claim{count === 1 ? '' : 's'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
