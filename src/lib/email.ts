// Transactional email via Resend. This module never throws on a missing API
// key — it logs and no-ops so local/preview environments work without email
// configured. Only server code should import this (it reads server env vars).
import { SITE, formatDeadline } from '@/lib/utils';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';

const BRAND = '#7526d1';
const FROM = process.env.RESEND_FROM || 'ClaimMatch <onboarding@resend.dev>';

export interface MatchEmailItem {
  title: string;
  slug: string;
  typical_payout?: string | null;
  deadline?: string | null;
}

export interface MatchEmailOpts {
  name?: string;
  matches: MatchEmailItem[];
  /** Recipient email — used to build the one-click unsubscribe link. */
  to?: string;
}

/** Lazily build a Resend client, or null when no API key is configured. */
function getResend(): { emails: { send: (o: unknown) => Promise<unknown> } } | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    // Imported lazily so the dependency is only touched when actually sending.
    const { Resend } = require('resend');
    return new Resend(key);
  } catch (err) {
    console.warn('[email] Resend unavailable:', err);
    return null;
  }
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lawsuitUrl(slug: string): string {
  return `${SITE.url.replace(/\/$/, '')}/lawsuits/${encodeURIComponent(slug)}`;
}

/**
 * One-click unsubscribe link for email footers. The recipient's email is
 * base64url-encoded into the `e` param; /api/unsubscribe decodes it and clears
 * their email opt-in. Keep in sync with the decoder in @/app/api/unsubscribe.
 */
export function unsubscribeUrl(email: string): string {
  const token = Buffer.from(email).toString('base64url');
  return `${SITE.url.replace(/\/$/, '')}/unsubscribe?e=${encodeURIComponent(token)}`;
}

/** Footer legal + unsubscribe block shared by all transactional emails. */
function footerNote(reason: string, to?: string): string {
  const unsub = to
    ? ` <a href="${unsubscribeUrl(to)}" style="color:#8b859e;text-decoration:underline;">Unsubscribe</a> or <a href="${SITE.url.replace(/\/$/, '')}/settings" style="color:#8b859e;text-decoration:underline;">manage preferences</a>.`
    : ` <a href="${SITE.url.replace(/\/$/, '')}/settings" style="color:#8b859e;text-decoration:underline;">Manage your email preferences</a> to unsubscribe.`;
  return `
        <tr><td style="padding:22px 8px 0 8px;">
          <p style="margin:0 0 12px 0;font-size:11px;color:#8b859e;line-height:1.5;">${esc(SHORT_DISCLAIMER)}</p>
          <p style="margin:0;font-size:11px;color:#a29cb5;line-height:1.5;">${esc(reason)}${unsub}</p>
        </td></tr>`;
}

/** Render a clean, branded HTML email listing the user's new matches. */
export function renderMatchEmail(opts: MatchEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const count = opts.matches.length;
  const countLabel =
    count === 1 ? '1 new settlement' : `${count} new settlements`;

  const cards = opts.matches
    .map((m) => {
      const meta: string[] = [];
      if (m.typical_payout) meta.push(`Typical payout: ${esc(m.typical_payout)}`);
      meta.push(`Deadline: ${esc(formatDeadline(m.deadline ?? null))}`);
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
        <tr>
          <td style="padding:20px 22px;">
            <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(m.title)}</div>
            <div style="font-size:13px;color:#6b6480;margin-top:8px;">${meta.join(' &nbsp;•&nbsp; ')}</div>
            <div style="margin-top:16px;">
              <a href="${lawsuitUrl(m.slug)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">View &amp; file your claim →</a>
            </div>
          </td>
        </tr>
      </table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New settlement matches</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">You have ${esc(countLabel)} to review</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} we found ${count === 1 ? 'a settlement' : 'settlements'} that match the profile you shared. Review the details and file a claim while the window is open.</p>
          ${cards}
          <p style="margin:22px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">See everything you may qualify for on your <a href="${SITE.url.replace(/\/$/, '')}/dashboard" style="color:${BRAND};text-decoration:underline;">ClaimMatch dashboard</a>.</p>
        </td></tr>
        ${footerNote(`You're receiving this because you opted in to match alerts from ${SITE.name}.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Render a short branded welcome email. */
export function renderWelcomeEmail(name?: string, to?: string): string {
  const greeting = name ? `Hi ${esc(name)},` : 'Hi there,';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to ${esc(SITE.name)}</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">You're on the list</h1>
          <p style="margin:0 0 18px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} thanks for joining ${esc(SITE.name)}. We scan class-action settlements and lawsuits and email you the moment one opens up that you may qualify for — no digging required.</p>
          <div>
            <a href="${SITE.url.replace(/\/$/, '')}/onboarding" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">Complete your profile →</a>
          </div>
          <p style="margin:20px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">The more we know about you, the sharper your matches. It takes about two minutes.</p>
        </td></tr>
        ${footerNote(`You're receiving this because you signed up at ${SITE.name}.`, to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Send the "new matches" email. No-ops (logs) when Resend isn't configured. */
export async function sendMatchEmail(to: string, opts: MatchEmailOpts): Promise<void> {
  if (!to || !opts?.matches?.length) return;
  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping match email to ${to} (${opts.matches.length} matches).`,
    );
    return;
  }
  const count = opts.matches.length;
  const subject =
    count === 1
      ? `A new settlement match on ${SITE.name}`
      : `${count} new settlement matches on ${SITE.name}`;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderMatchEmail({ ...opts, to }),
    });
  } catch (err) {
    console.error(`[email] Failed to send match email to ${to}:`, err);
  }
}

/** Send the welcome email. No-ops (logs) when Resend isn't configured. */
export async function sendWelcomeEmail(to: string, name?: string): Promise<void> {
  if (!to) return;
  const resend = getResend();
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping welcome email to ${to}.`);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Welcome to ${SITE.name}`,
      html: renderWelcomeEmail(name, to),
    });
  } catch (err) {
    console.error(`[email] Failed to send welcome email to ${to}:`, err);
  }
}
