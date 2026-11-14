/**
 * Member notices for one-click claims (docs/designs/one-click-filing.md,
 * section 10): transactional emails, sent whatever the reminder settings,
 * when a claim is queued (with an exact copy of what was signed), goes to
 * the administrator, needs the member, is not accepted, or is handed back to
 * finish on the official site. Plus the opt-in deadline reminder for an
 * unsigned one-click claim (src/lib/deadline-reminders.ts).
 *
 * Server only. Never throws: a notice that cannot be sent is logged (ids
 * only) and the filing goes on. Copy: plain English, no promise of payment.
 */
import { unsubscribeUrl } from '@/lib/email';
import { sendTransactionalEmail } from '@/lib/email-transactional';
import { legalContact } from '@/lib/legal-contact';
import { createServiceClient } from '@/lib/supabase/server';
import { PUBLIC_BRAND, SITE } from '@/lib/utils';
import { CanonicalPacketSchema } from '../v2/contract';
import { FilingSpecContentSchema } from '../v2/contract-spec';
import { formatCalendarDate } from './dates';
import { orderedPacketFields } from './packet-fields';
import { signedAtText } from './administrator-email';

const BRAND_COLOR = '#7526d1';

export type MemberNoticeKind = 'queued' | 'filed' | 'needs_you' | 'not_accepted' | 'handed_back';

export interface MemberNoticeEvent {
  kind: MemberNoticeKind;
  claimId: string;
  userId: string;
  lawsuitId: string;
  /** Makes the send idempotent (Resend key): the job or signature id the notice is about. */
  eventId: string;
  confirmationNumber?: string | null;
  /** queued: the signature whose exact text is copied into the email. */
  signatureId?: string | null;
  /** handed_back: why, as a member-safe code (deadline_too_close gets its own sentence). */
  reason?: string | null;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function siteUrl(path: string): string {
  return `${SITE.url.replace(/\/$/, '')}${path}`;
}

interface NoticeCopy {
  subject: string;
  heading: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  /** Label/value lines (the signed copy); shown after the paragraphs. */
  copy?: Array<{ label: string; text: string }>;
  statement?: string | null;
  footerReason: string;
  unsubscribeTo?: string;
}

export function renderNotice(copy: NoticeCopy): { subject: string; html: string; text: string } {
  const postal = legalContact().postalAddress;
  const about = `${PUBLIC_BRAND} is not a law firm and does not give legal advice. The settlement administrator decides each claim and any payment.`;
  const unsub = copy.unsubscribeTo
    ? ` <a href="${unsubscribeUrl(copy.unsubscribeTo)}" style="color:#8b859e;text-decoration:underline;">Unsubscribe</a>`
    : '';
  const lines = (copy.copy ?? [])
    .map((l) => `<tr><td style="padding:4px 8px;color:#6b6480;font-size:13px;vertical-align:top;">${esc(l.label)}</td><td style="padding:4px 8px;font-size:13px;color:#171326;">${esc(l.text) || '&nbsp;'}</td></tr>`)
    .join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px 4px;"><span style="font-size:22px;font-weight:800;color:${BRAND_COLOR};font-family:Georgia,'Times New Roman',serif;">${esc(PUBLIC_BRAND)}</span></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #ece7f6;font-family:Arial,Helvetica,sans-serif;">
<h1 style="margin:0 0 12px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">${esc(copy.heading)}</h1>
${copy.paragraphs.map((p) => `<p style="margin:0 0 14px 0;font-size:15px;color:#43405a;line-height:1.55;">${esc(p)}</p>`).join('\n')}
${lines ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 14px 0;border:1px solid #ece7f6;border-radius:8px;">${lines}</table>` : ''}
${copy.statement ? `<p style="margin:0 0 14px 0;font-size:13px;color:#43405a;line-height:1.5;white-space:pre-wrap;"><strong>The statement you signed:</strong><br>${esc(copy.statement)}</p>` : ''}
<a href="${esc(copy.cta.url)}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">${esc(copy.cta.label)}</a>
</td></tr>
<tr><td style="padding:22px 8px 0 8px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 10px 0;font-size:11px;color:#8b859e;line-height:1.5;">${esc(about)}</p>
${postal ? `<p style="margin:0 0 8px 0;font-size:11px;color:#a29cb5;">${esc(postal)}</p>` : ''}
<p style="margin:0;font-size:11px;color:#a29cb5;line-height:1.5;">${esc(copy.footerReason)}${unsub}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    copy.heading,
    '',
    ...copy.paragraphs,
    ...(copy.copy?.length ? ['', ...copy.copy.map((l) => `${l.label}: ${l.text}`)] : []),
    ...(copy.statement ? ['', 'The statement you signed:', copy.statement] : []),
    '',
    `${copy.cta.label}: ${copy.cta.url}`,
    '',
    about,
    ...(postal ? [postal] : []),
    copy.footerReason,
  ].join('\n');
  return { subject: copy.subject, html, text };
}

interface NoticeFacts {
  title: string;
  slug: string;
  deadline: string | null;
  confirmationNumber: string | null;
  copy?: Array<{ label: string; text: string }>;
  statement?: string | null;
  reason?: string | null;
}

export function noticeCopy(kind: MemberNoticeKind, facts: NoticeFacts): NoticeCopy {
  const claimUrl = siteUrl(`/claim/${encodeURIComponent(facts.slug)}`);
  const by = facts.deadline ? ` The deadline is ${formatCalendarDate(facts.deadline)}.` : '';
  const footerReason = `You're receiving this because you signed a claim in ${PUBLIC_BRAND}.`;
  switch (kind) {
    case 'queued':
      return {
        subject: `Your signed claim for ${facts.title} is in line`,
        heading: 'We have your signed claim',
        paragraphs: [
          `Thanks for signing your claim for ${facts.title}. It is waiting to go to the settlement administrator. You can withdraw it in ${PUBLIC_BRAND} until it goes out.`,
          'Here is an exact copy of what you signed. Keep it for your records.',
        ],
        copy: facts.copy,
        statement: facts.statement ?? null,
        cta: { label: 'See your claim', url: claimUrl },
        footerReason,
      };
    case 'filed':
      return {
        subject: `Your claim for ${facts.title} went to the administrator`,
        heading: 'Your claim went to the administrator',
        paragraphs: [
          `Your signed claim for ${facts.title} went to the settlement administrator. The administrator reviews each claim and decides on any payment.`,
          facts.confirmationNumber
            ? `The administrator's confirmation number is ${facts.confirmationNumber}.`
            : `When the administrator sends you a confirmation number, add it to this claim in ${PUBLIC_BRAND} so you can keep track of it.`,
        ],
        cta: { label: 'See your claim', url: claimUrl },
        footerReason,
      };
    case 'needs_you':
      return {
        subject: `Your claim for ${facts.title} needs you`,
        heading: 'Your claim needs a change',
        paragraphs: [
          `Your claim for ${facts.title} needs a change before it can go to the administrator. Open it to see what to fix, then sign again.${by}`,
        ],
        cta: { label: 'Fix your claim', url: claimUrl },
        footerReason,
      };
    case 'not_accepted':
      return {
        subject: `The administrator did not accept your claim for ${facts.title}`,
        heading: 'The administrator did not accept this claim',
        paragraphs: [
          `The settlement administrator did not accept the claim for ${facts.title}. You can still file on the official site if the deadline has not passed.${by}`,
          `Your answers stay saved in ${PUBLIC_BRAND}, ready to copy.`,
        ],
        cta: { label: 'Open your claim', url: claimUrl },
        footerReason,
      };
    case 'handed_back':
    default:
      return {
        subject: `Finish your claim for ${facts.title} on the official site`,
        heading: 'Please finish this claim on the official site',
        paragraphs: [
          facts.reason === 'deadline_too_close'
            ? `The deadline for ${facts.title} is too close for ${PUBLIC_BRAND} to send your claim in time.`
            : `${PUBLIC_BRAND} can’t send your claim for ${facts.title}.`,
          `Please finish it on the official site.${by} Everything you entered is saved in ${PUBLIC_BRAND}, ready to copy.`,
        ],
        cta: { label: 'Finish your claim', url: claimUrl },
        footerReason,
      };
  }
}

async function signedCopy(svc: ReturnType<typeof createServiceClient>, signatureId: string) {
  const { data: sig } = await svc
    .from('claim_signatures')
    .select('packet_canonical, typed_name, signed_at, statement_text, spec_id')
    .eq('id', signatureId)
    .maybeSingle();
  if (!sig) return null;
  const { data: spec } = await svc.from('filing_specs').select('content').eq('id', sig.spec_id).maybeSingle();
  const packet = CanonicalPacketSchema.safeParse(JSON.parse(String(sig.packet_canonical)));
  const content = FilingSpecContentSchema.safeParse(spec?.content);
  if (!packet.success || !content.success) return null;
  const at = signedAtText(String(sig.signed_at));
  return {
    copy: [
      ...orderedPacketFields(packet.data, content.data).map((f) => ({ label: f.label, text: f.text })),
      { label: 'Signed by', text: String(sig.typed_name) },
      { label: 'Signed at', text: `${at.eastern} (${at.utc})` },
    ],
    statement: String(sig.statement_text),
  };
}

/** Sends the notice. Never throws; false when it was not sent. */
export async function notifyMember(event: MemberNoticeEvent): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const [{ data: profile }, { data: lawsuit }] = await Promise.all([
      svc.from('profiles').select('email').eq('id', event.userId).maybeSingle(),
      svc.from('lawsuits').select('title, slug, deadline').eq('id', event.lawsuitId).maybeSingle(),
    ]);
    const to = typeof profile?.email === 'string' ? profile.email.trim() : '';
    if (!to.includes('@') || !lawsuit) return false;
    const signed = event.kind === 'queued' && event.signatureId ? await signedCopy(svc, event.signatureId) : null;
    const rendered = renderNotice(
      noticeCopy(event.kind, {
        title: String(lawsuit.title ?? 'your settlement'),
        slug: String(lawsuit.slug ?? ''),
        deadline: typeof lawsuit.deadline === 'string' ? lawsuit.deadline : null,
        confirmationNumber: event.confirmationNumber ?? null,
        copy: signed?.copy,
        statement: signed?.statement ?? null,
        reason: event.reason ?? null,
      }),
    );
    const sent = await sendTransactionalEmail({
      to,
      ...rendered,
      idempotencyKey: `notice:${event.kind}:${event.eventId}`,
    });
    if (sent.status !== 'sent') {
      console.warn('[filing/notice] not sent', { kind: event.kind, claim: event.claimId, status: sent.status });
    }
    return sent.status === 'sent';
  } catch (err) {
    console.error('[filing/notice] failed', { kind: event.kind, claim: event.claimId, name: (err as Error)?.name });
    return false;
  }
}

/** The opt-in 7-day / 1-day reminder for a one-click claim the member has not signed yet. */
export function renderAgentReminder(opts: { title: string; slug: string; deadline: string; kind: '7d' | '1d'; to: string }) {
  const when = opts.kind === '1d' ? 'tomorrow' : 'in 7 days';
  return renderNotice({
    subject: `Your claim for ${opts.title} isn't signed yet: the deadline is ${when}`,
    heading: 'Your claim is not finished yet',
    paragraphs: [
      `Your claim for ${opts.title} is saved in ${PUBLIC_BRAND} but not signed yet. The listed deadline is ${formatCalendarDate(opts.deadline)}.`,
      'Open it to finish your answers and sign, or finish it on the official site if you prefer.',
    ],
    cta: { label: 'Finish your claim', url: siteUrl(`/claim/${encodeURIComponent(opts.slug)}`) },
    footerReason: `You're receiving this because you opted in to emails from ${PUBLIC_BRAND} and started this claim.`,
    unsubscribeTo: opts.to,
  });
}

export async function sendAgentReminderEmail(opts: { title: string; slug: string; deadline: string; kind: '7d' | '1d'; to: string; claimId: string }): Promise<boolean> {
  const sent = await sendTransactionalEmail({
    to: opts.to,
    ...renderAgentReminder(opts),
    idempotencyKey: `reminder:${opts.kind}:${opts.claimId}`,
  });
  return sent.status === 'sent';
}
