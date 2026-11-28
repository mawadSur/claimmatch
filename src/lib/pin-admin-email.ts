/**
 * PIN-gated settlements (Notice ID / PIN on the official site): the member
 * can ask Lawsuit AI to email the administrator for a notice or claim ID.
 * Request intake, outbound sending, the paper fallback UI, and the reminder
 * email each have their own default-off switch.
 *
 * A recorded response is the notice_id on this claim. Lawsuit AI never
 * collects the official site's login PIN or password.
 */
import { NOTICE_PIN_NOT_COLLECTED } from './notice-id';
import { extractAdminEmail } from './notice-request';
import { formatDeadline } from './utils';

export const DEFAULT_PAPER_FALLBACK_DAYS = 7;
export const PAPER_FALLBACK_MIN_DAYS = 1;
export const PAPER_FALLBACK_MAX_DAYS = 90;

export const PIN_ADMIN_EMAIL_CTA = 'Email the administrator for me';
export const PIN_ADMIN_EMAIL_SENDING = 'Sending…';
export const PIN_ADMIN_EMAIL_NO_ADDRESS =
  'This listing has no administrator email we can use. Copy the letter below and send it yourself.';
export const PIN_ADMIN_EMAIL_SIGN_IN = 'Sign in to have Lawsuit AI email the administrator for you.';
export const PIN_ADMIN_EMAIL_WAITING_LABEL = 'Emailed administrator — waiting on reply';
export const PAPER_FALLBACK_HEADING = 'Paper form fallback';
export const PAPER_FALLBACK_CTA = 'Open the paper claim form';
export const PAPER_FALLBACK_OFFICIAL_CTA = 'Official site and mail-in instructions';

export function paperFallbackAfterDays(raw: string | undefined = process.env.PAPER_FALLBACK_AFTER_DAYS): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_PAPER_FALLBACK_DAYS;
  if (!Number.isFinite(n) || n < PAPER_FALLBACK_MIN_DAYS || n > PAPER_FALLBACK_MAX_DAYS) {
    return DEFAULT_PAPER_FALLBACK_DAYS;
  }
  return n;
}

export function paperFallbackAfterMs(days = paperFallbackAfterDays()): number {
  return days * 24 * 60 * 60 * 1000;
}

/** When the 7-day clock starts: the send, or the request if it has not gone out yet. */
export function pinAdminEmailClockStart(input: {
  pin_admin_email_sent_at?: string | null;
  pin_admin_email_requested_at?: string | null;
}): string | null {
  return input.pin_admin_email_sent_at ?? input.pin_admin_email_requested_at ?? null;
}

export function hasPinAdminEmailResponse(noticeId: string | null | undefined): boolean {
  return Boolean(noticeId && noticeId.trim());
}

export function isAtLeastMsAgo(iso: string | null | undefined, now: Date, ms: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at >= ms;
}

export function paperFallbackDue(input: {
  pin_admin_email_sent_at?: string | null;
  pin_admin_email_requested_at?: string | null;
  notice_id?: string | null;
  now: Date;
  days?: number;
}): boolean {
  if (hasPinAdminEmailResponse(input.notice_id)) return false;
  const start = pinAdminEmailClockStart(input);
  if (!start) return false;
  return isAtLeastMsAgo(start, input.now, paperFallbackAfterMs(input.days ?? paperFallbackAfterDays()));
}

export function formatPinAdminDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const day = iso.slice(0, 10);
  const formatted = formatDeadline(day);
  return formatted === 'Varies' ? '' : formatted;
}

export function pinAdminWaitingCopy(sentAt: string): string {
  const date = formatPinAdminDate(sentAt);
  return date ? `${PIN_ADMIN_EMAIL_WAITING_LABEL} · ${date}` : PIN_ADMIN_EMAIL_WAITING_LABEL;
}

export function pinAdminQueuedCopy(requestedAt: string): string {
  const date = formatPinAdminDate(requestedAt);
  return date
    ? `Email request saved ${date}. Lawsuit AI will email the administrator when sending is available.`
    : 'Email request saved. Lawsuit AI will email the administrator when sending is available.';
}

export const PAPER_FALLBACK_BODY =
  'Your notice ID is not on file yet. If the settlement accepts paper claims, you can print and mail the claim form.';

export interface PinAdminStatus {
  kind: 'idle' | 'queued' | 'waiting' | 'replied' | 'paper_fallback';
  requestedAt: string | null;
  sentAt: string | null;
  headline: string | null;
}

export function pinAdminStatus(input: {
  notice_id?: string | null;
  pin_admin_email_requested_at?: string | null;
  pin_admin_email_sent_at?: string | null;
  now: Date;
  days?: number;
  paperFallbackEnabled?: boolean;
}): PinAdminStatus {
  const requestedAt = input.pin_admin_email_requested_at ?? null;
  const sentAt = input.pin_admin_email_sent_at ?? null;
  if (hasPinAdminEmailResponse(input.notice_id)) {
    return { kind: 'replied', requestedAt, sentAt, headline: null };
  }
  if (input.paperFallbackEnabled && paperFallbackDue(input)) {
    return { kind: 'paper_fallback', requestedAt, sentAt, headline: PAPER_FALLBACK_BODY };
  }
  if (sentAt) {
    return { kind: 'waiting', requestedAt, sentAt, headline: pinAdminWaitingCopy(sentAt) };
  }
  if (requestedAt) {
    return { kind: 'queued', requestedAt, sentAt, headline: pinAdminQueuedCopy(requestedAt) };
  }
  return { kind: 'idle', requestedAt, sentAt, headline: null };
}

export interface PinAdminEmailParts {
  title: string;
  slug: string;
  administrator?: string | null;
  officialHref?: string | null;
  senderName: string;
  senderEmail: string;
}

export interface PinAdminRenderedEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  administratorLabel: string;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function administratorLabel(administrator: string | null | undefined): string {
  const raw = administrator?.trim() || '';
  if (!raw) return 'the settlement administrator';
  const withoutEmail = raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, '').replace(/\s+/g, ' ').trim();
  return withoutEmail || 'the settlement administrator';
}

/**
 * The email Lawsuit AI sends to the administrator when the member opts in.
 * Different from the DIY letter (that letter says Lawsuit AI did not send it).
 */
export function pinAdminAdministratorEmail(input: PinAdminEmailParts): PinAdminRenderedEmail | null {
  const to = extractAdminEmail(input.administrator);
  if (!to) return null;
  const title = input.title.trim() || 'this settlement';
  const label = administratorLabel(input.administrator);
  const official = input.officialHref?.trim() || '';
  const officialLine = official
    ? `Official settlement website: ${official}`
    : 'The claimant does not have the official settlement website URL.';
  const subject = `Request for notice or claim ID — ${title}`;
  const paragraphs = [
    `Hello ${label},`,
    `Lawsuit AI is writing at the request of ${input.senderName} (${input.senderEmail}), who believes they may be a class member in ${title} and does not have a notice ID or claim ID.`,
    NOTICE_PIN_NOT_COLLECTED,
    'Please reply to the claimant with the notice or claim ID, or with the paper claim form, if they qualify.',
    officialLine,
    `Thank you,\nLawsuit AI on behalf of ${input.senderName}`,
  ];
  const text = paragraphs.join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;">
${paragraphs.map((p) => `<p style="white-space:pre-wrap;">${esc(p)}</p>`).join('\n')}
</body></html>`;
  return { to, subject, text, html, administratorLabel: label };
}

export function paperFormHref(input: {
  formUrl?: string | null;
  officialHref?: string | null;
  slug: string;
}): string {
  const form = input.formUrl?.trim();
  if (form && /^https?:\/\//i.test(form)) return form;
  const official = input.officialHref?.trim();
  if (official && /^https?:\/\//i.test(official)) return official;
  return `/lawsuits/${input.slug}`;
}
