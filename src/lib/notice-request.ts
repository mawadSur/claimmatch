/**
 * Pre-filled letter a visitor copies or downloads to ask the administrator
 * for a notice or claim ID. Lawsuit AI does not send this DIY letter; the
 * optional PIN-gated administrator email is a separate path.
 */

export const NOTICE_REQUESTED_STORAGE_PREFIX = 'cm_notice_requested:';

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export interface NoticeRequestInput {
  title: string;
  slug: string;
  administrator?: string | null;
  officialHref?: string | null;
  /** Optional name the visitor typed; never required. */
  senderName?: string | null;
}

export interface NoticeRequestLetter {
  administratorLabel: string;
  contactEmail: string | null;
  subject: string;
  body: string;
  mailtoHref: string | null;
  filename: string;
}

function slugFilename(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'settlement';
  return `notice-id-request-${safe}.txt`;
}

export function extractAdminEmail(administrator: string | null | undefined): string | null {
  const match = administrator?.match(EMAIL_IN_TEXT);
  return match ? match[0] : null;
}

export function noticeRequestLetter(input: NoticeRequestInput): NoticeRequestLetter {
  const title = input.title.trim() || 'this settlement';
  const adminRaw = input.administrator?.trim() || '';
  const contactEmail = extractAdminEmail(adminRaw);
  const administratorLabel = adminRaw
    ? adminRaw.replace(EMAIL_IN_TEXT, '').replace(/\s+/g, ' ').trim() || 'the settlement administrator'
    : 'the settlement administrator';
  const official = input.officialHref?.trim() || '';
  const sender = input.senderName?.trim() || '[Your name]';
  const subject = `Request for notice or claim ID — ${title}`;
  const officialLine = official
    ? `Official settlement website: ${official}`
    : 'I do not have the official settlement website URL.';
  const body = [
    `Hello ${administratorLabel},`,
    '',
    `I believe I may be a class member in ${title}. I did not receive a mailed or emailed notice, or I no longer have it.`,
    '',
    'Please send me the notice, or tell me my notice ID or claim ID, so I can file on the official site if I qualify. I am writing this myself; Lawsuit AI did not send this message.',
    '',
    officialLine,
    '',
    'Thank you,',
    sender,
  ].join('\n');

  const mailtoHref = contactEmail
    ? `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return {
    administratorLabel,
    contactEmail,
    subject,
    body,
    mailtoHref,
    filename: slugFilename(input.slug),
  };
}

export function noticeRequestedStorageKey(slug: string): string {
  return `${NOTICE_REQUESTED_STORAGE_PREFIX}${slug}`;
}

export function readStoredNoticeRequested(slug: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(noticeRequestedStorageKey(slug)) === '1';
  } catch {
    return false;
  }
}

export function writeStoredNoticeRequested(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(noticeRequestedStorageKey(slug), '1');
  } catch {
    // Private mode / quota — the in-memory UI still works until refresh.
  }
}
