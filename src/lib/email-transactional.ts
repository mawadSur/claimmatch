// One-click filing's transactional email (administrator_email channel and
// member filing notices) via Resend. Kept out of src/lib/email.ts so that
// file does not grow. Never throws; server only (it reads server env vars).
import { resendEnvelope, resendReplyTo } from '@/lib/resend-mail';

/** A transactional email with a text part, CC, attachments (base64) and an idempotency key. */
export interface TransactionalEmail {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
  /** Sent as Resend's Idempotency-Key: a repeat with the same key is not delivered twice (24 hours). */
  idempotencyKey?: string;
}

export type TransactionalEmailResult =
  | { status: 'sent'; id: string | null }
  | { status: 'not_configured' }
  /** Resend was called and did not confirm: the message may or may not have gone out. */
  | { status: 'failed'; error: string };

type ResendClient = { emails: { send: (o: unknown, options?: unknown) => Promise<unknown> } };

/** Lazily build a Resend client, or null when no API key is configured. */
function getResend(): ResendClient | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    // Imported lazily so the dependency is only touched when actually sending.
    const { Resend } = require('resend');
    return new Resend(key) as ResendClient;
  } catch (err) {
    console.warn('[email] Resend unavailable:', err);
    return null;
  }
}

/** Never throws. Resend reports API errors in its answer rather than throwing, so both are read. */
export async function sendTransactionalEmail(mail: TransactionalEmail): Promise<TransactionalEmailResult> {
  const resend = getResend();
  if (!resend) return { status: 'not_configured' };
  try {
    const answer = (await resend.emails.send(
      {
        ...resendEnvelope(),
        replyTo: resendReplyTo(),
        to: mail.to,
        cc: mail.cc && mail.cc.length > 0 ? mail.cc : undefined,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: mail.attachments && mail.attachments.length > 0 ? mail.attachments : undefined,
      },
      mail.idempotencyKey ? { idempotencyKey: mail.idempotencyKey } : undefined,
    )) as { data?: { id?: unknown } | null; error?: { name?: unknown } | null } | null | undefined;
    if (answer?.error) return { status: 'failed', error: String(answer.error.name ?? 'send_failed') };
    return { status: 'sent', id: typeof answer?.data?.id === 'string' ? answer.data.id : null };
  } catch (err) {
    return { status: 'failed', error: (err as Error)?.name || 'send_failed' };
  }
}
