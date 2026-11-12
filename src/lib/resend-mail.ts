/**
 * Shared Resend envelope: sender plus optional reply-to. Callers pass this
 * into every emails.send so Reply-To cannot drift per template.
 */
import { PUBLIC_BRAND } from '@/lib/utils';

export function resendFrom(): string {
  return process.env.RESEND_FROM || `${PUBLIC_BRAND} <onboarding@resend.dev>`;
}

/** Trimmed RESEND_REPLY_TO, or undefined when unset/blank so Resend omits it. */
export function resendReplyTo(): string | undefined {
  const value = process.env.RESEND_REPLY_TO?.trim();
  return value || undefined;
}

/** `from`, plus `reply_to` only when RESEND_REPLY_TO is set. */
export function resendEnvelope(): { from: string; reply_to?: string } {
  const from = resendFrom();
  const replyTo = resendReplyTo();
  return replyTo ? { from, reply_to: replyTo } : { from };
}
