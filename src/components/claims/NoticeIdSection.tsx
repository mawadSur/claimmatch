'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import {
  NOTICE_PIN_NOT_COLLECTED,
  parseNoticeId,
  readStoredNoticeId,
  writeStoredNoticeId,
  noticeIdHelp,
} from '@/lib/notice-id';
import { SIGN_IN_TO_SAVE } from '@/lib/claim-actions';
import {
  extractAdminEmail,
  readStoredNoticeRequested,
  writeStoredNoticeRequested,
} from '@/lib/notice-request';
import {
  PIN_ADMIN_EMAIL_CTA,
  PIN_ADMIN_EMAIL_NO_ADDRESS,
  PIN_ADMIN_EMAIL_SENDING,
  PIN_ADMIN_EMAIL_SIGN_IN,
  paperFormHref,
  pinAdminStatus,
} from '@/lib/pin-admin-email';
import { claimReturnPath } from '@/lib/signup-context';
import { NoticeRequestLetter } from './NoticeRequestLetter';
import { PaperFallbackCard } from './PaperFallbackCard';

export function NoticeIdSection({
  slug,
  lawsuitId,
  title,
  administrator,
  officialHref,
  officialLookupHref,
  signedIn,
  savedNoticeId = null,
  savedRequestedNoticeAt = null,
  pinAdminRequestedAt = null,
  pinAdminSentAt = null,
  pinAdminOutreachEnabled = false,
  paperFallbackEnabled = false,
  formUrl = null,
}: {
  slug: string;
  lawsuitId?: string;
  title: string;
  administrator: string | null | undefined;
  officialHref?: string | null;
  officialLookupHref?: string | null;
  signedIn: boolean;
  savedNoticeId?: string | null;
  savedRequestedNoticeAt?: string | null;
  pinAdminRequestedAt?: string | null;
  pinAdminSentAt?: string | null;
  pinAdminOutreachEnabled?: boolean;
  paperFallbackEnabled?: boolean;
  formUrl?: string | null;
}) {
  const help = noticeIdHelp(administrator);
  const lookup = officialLookupHref || officialHref;
  const [value, setValue] = useState(savedNoticeId ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const hasRequest = Boolean(savedRequestedNoticeAt || (pinAdminOutreachEnabled && pinAdminRequestedAt));
  const [noNotice, setNoNotice] = useState(hasRequest);
  const [requested, setRequested] = useState(hasRequest);
  const [emailing, setEmailing] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [pinRequestedAt, setPinRequestedAt] = useState(pinAdminRequestedAt);
  const [pinSentAt, setPinSentAt] = useState(pinAdminSentAt);
  const adminStatus = pinAdminStatus({
    notice_id: savedNoticeId,
    pin_admin_email_requested_at: pinRequestedAt,
    pin_admin_email_sent_at: pinSentAt,
    now: new Date(),
    paperFallbackEnabled,
  });
  const outreachHeadline = pinAdminOutreachEnabled && adminStatus.kind !== 'paper_fallback'
    ? adminStatus.headline
    : null;
  const paperHref = paperFormHref({ formUrl, officialHref: lookup, slug });
  const hasAdminEmail = Boolean(extractAdminEmail(administrator));

  useEffect(() => {
    if (savedNoticeId) {
      setValue(savedNoticeId);
      return;
    }
    const stored = readStoredNoticeId(slug);
    if (stored) setValue(stored);
  }, [slug, savedNoticeId]);

  useEffect(() => {
    if (savedRequestedNoticeAt) {
      setRequested(true);
      setNoNotice(true);
      return;
    }
    if (readStoredNoticeRequested(slug)) {
      setRequested(true);
      setNoNotice(true);
    }
  }, [slug, savedRequestedNoticeAt]);

  async function markRequested() {
    writeStoredNoticeRequested(slug);
    setRequested(true);
    if (!signedIn || !lawsuitId) return;
    try {
      await fetch('/api/claims/request-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawsuit_id: lawsuitId }),
      });
    } catch {
      // Guest storage already recorded the step.
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseNoticeId(value);
    if (!parsed.ok) {
      setStatus('error');
      setMessage(parsed.message);
      return;
    }
    writeStoredNoticeId(slug, parsed.value);
    setValue(parsed.value);
    if (!signedIn || !lawsuitId) {
      setStatus('saved');
      setMessage(`${SIGN_IN_TO_SAVE} We kept this ID in this browser until you do.`);
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/claims/notice-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawsuit_id: lawsuitId, notice_id: parsed.value }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setStatus('error');
        setMessage(json?.error || 'We could not save that ID. Try again.');
        return;
      }
      setStatus('saved');
      setMessage('Saved to this claim. We never store the official site’s PIN or password.');
    } catch {
      setStatus('error');
      setMessage('We could not reach Lawsuit AI. Check your connection and try again.');
    }
  }

  const signupHref = `/signup?next=${encodeURIComponent(claimReturnPath(slug) || `/lawsuits/${slug}#notice-id`)}`;

  return (
    <section
      id="notice-id"
      className="scroll-mt-24 space-y-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 className="text-lg font-bold">Add your notice ID</h2>
      <p className="text-sm text-ink-muted">
        This administrator asks for a notice ID or claim ID from the letter or email they sent.
        Enter that ID here. {NOTICE_PIN_NOT_COLLECTED}
      </p>
      {outreachHeadline && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-ink">{outreachHeadline}</p>
      )}
      {!outreachHeadline && adminStatus.kind !== 'paper_fallback' && adminStatus.kind !== 'replied' && requested && (
        <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-ink">
          You marked that you requested your notice. When the administrator replies, add the ID below.
        </p>
      )}
      {adminStatus.kind === 'paper_fallback' && (
        <PaperFallbackCard formHref={paperHref} officialHref={lookup} />
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor={`notice-id-${slug}`} className="field-label">
          Notice ID or claim ID
        </label>
        <input
          id={`notice-id-${slug}`}
          name="notice_id"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          autoComplete="off"
          spellCheck={false}
          className="field-input"
          placeholder="The ID printed on your postcard or email"
          aria-describedby={`notice-id-help-${slug}`}
        />
        <p id={`notice-id-help-${slug}`} className="text-xs text-ink-muted">
          Saved on your claim for this settlement only, not on your shared claim profile.
        </p>
        <div className="flex min-w-0 flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={status === 'saving'}>
            {signedIn ? 'Save notice ID' : 'Save on this device'}
          </button>
          {!signedIn && (
            <Link href={signupHref} className="btn-secondary">
              Sign in to save
            </Link>
          )}
        </div>
        {message && (
          <p className={`text-sm ${status === 'error' ? 'text-danger-700' : 'text-ink-muted'}`}>{message}</p>
        )}
      </form>

      <details className="rounded-xl border border-slate-200 bg-brand-50 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <HelpCircle className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
          Where’s my ID?
        </summary>
        <p className="mt-2 text-sm text-ink-muted">
          {help.administratorLabel}: {help.where}
        </p>
      </details>

      <div>
        <button
          type="button"
          className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
          onClick={() => setNoNotice((open) => !open)}
        >
          No notice?
        </button>
        {noNotice && (
          <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-brand-50 px-4 py-3 text-sm text-ink">
            <p>
              Use this letter to ask {help.administratorLabel} for your notice or claim ID.
            </p>
            {pinAdminOutreachEnabled && (signedIn && lawsuitId ? (
              <button
                type="button"
                className="btn-primary"
                disabled={emailing || adminStatus.kind === 'waiting' || adminStatus.kind === 'queued'}
                onClick={async () => {
                  setEmailing(true);
                  setEmailMessage('');
                  try {
                    const res = await fetch('/api/claims/pin-admin-email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lawsuit_id: lawsuitId }),
                    });
                    const json = (await res.json().catch(() => null)) as {
                      claim?: {
                        pin_admin_email_requested_at?: string | null;
                        pin_admin_email_sent_at?: string | null;
                      };
                      send?: string;
                      error?: string;
                    } | null;
                    if (!res.ok) {
                      setEmailMessage(json?.error || 'We could not save that request. Try again.');
                      return;
                    }
                    setPinRequestedAt(json?.claim?.pin_admin_email_requested_at ?? new Date().toISOString());
                    setPinSentAt(json?.claim?.pin_admin_email_sent_at ?? null);
                    setRequested(true);
                    if (json?.send === 'no_address') setEmailMessage(PIN_ADMIN_EMAIL_NO_ADDRESS);
                  } catch {
                    setEmailMessage('We could not reach Lawsuit AI. Check your connection and try again.');
                  } finally {
                    setEmailing(false);
                  }
                }}
              >
                {emailing ? PIN_ADMIN_EMAIL_SENDING : PIN_ADMIN_EMAIL_CTA}
              </button>
            ) : (
              <p className="text-sm text-ink-muted">{PIN_ADMIN_EMAIL_SIGN_IN}</p>
            ))}
            {pinAdminOutreachEnabled && emailMessage && <p className="text-sm text-ink-muted">{emailMessage}</p>}
            {pinAdminOutreachEnabled && !hasAdminEmail && signedIn && <p className="text-sm text-ink-muted">{PIN_ADMIN_EMAIL_NO_ADDRESS}</p>}
            <NoticeRequestLetter
              title={title}
              slug={slug}
              administrator={administrator}
              officialHref={lookup}
            />
            <button type="button" className="btn-secondary" onClick={markRequested}>
              {requested ? 'Request marked' : 'I sent this request'}
            </button>
            {lookup && (
              <p>
                <a
                  href={lookup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-700 underline underline-offset-2"
                >
                  Official site lookup or contact
                </a>
              </p>
            )}
            <p>
              <Link href={`/lawsuits/${slug}#payment-updates`} className="font-semibold text-brand-700 underline underline-offset-2">
                Get an alert if this listing is updated
              </Link>
            </p>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {NOTICE_PIN_NOT_COLLECTED}
      </p>
    </section>
  );
}
