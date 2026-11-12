// Transactional email via Resend. This module never throws on a missing API
// key — it logs and no-ops so local/preview environments work without email
// configured. Only server code should import this (it reads server env vars).
import { SITE, formatDeadline } from '@/lib/utils';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { closingSoonEmailGate, commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { legalContact } from '@/lib/legal-contact';
import { unsubscribePageUrl } from '@/lib/unsubscribe';

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

function claimPageUrl(slug: string): string {
  return `${SITE.url.replace(/\/$/, '')}/claim/${encodeURIComponent(slug)}`;
}

function onboardingUrl(): string {
  return `${SITE.url.replace(/\/$/, '')}/onboarding`;
}

/**
 * Unsubscribe link for email footers. It opens a confirm page; nothing changes
 * until the reader presses the button. Token format: see @/lib/unsubscribe.
 */
export function unsubscribeUrl(email: string): string {
  return unsubscribePageUrl(email);
}

/** Footer legal + unsubscribe block shared by all transactional emails. */
function footerNote(reason: string, to?: string): string {
  const postal = legalContact().postalAddress;
  const unsub = to
    ? ` <a href="${unsubscribeUrl(to)}" style="color:#8b859e;text-decoration:underline;">Unsubscribe</a> or <a href="${SITE.url.replace(/\/$/, '')}/settings" style="color:#8b859e;text-decoration:underline;">manage preferences</a>.`
    : ` <a href="${SITE.url.replace(/\/$/, '')}/settings" style="color:#8b859e;text-decoration:underline;">Manage your email preferences</a> to unsubscribe.`;
  return `
        <tr><td style="padding:22px 8px 0 8px;">
          <p style="margin:0 0 12px 0;font-size:11px;color:#8b859e;line-height:1.5;">${esc(SHORT_DISCLAIMER)}</p>
          <p style="margin:0 0 8px 0;font-size:11px;color:#a29cb5;line-height:1.5;">${esc(SITE.name)}${postal ? `<br>${esc(postal)}` : ''}</p>
          <p style="margin:0;font-size:11px;color:#a29cb5;line-height:1.5;">This is a commercial email. ${esc(reason)}${unsub}</p>
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
              <a href="${lawsuitUrl(m.slug)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Review this settlement →</a>
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
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} we found ${count === 1 ? 'a settlement' : 'settlements'} that match the profile you shared. Review the details, pre-fill a packet, and submit on the official site while the window is open.</p>
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

export interface ClosingSoonEmailItem {
  title: string;
  slug: string;
  deadline: string;
}

export interface ClosingSoonEmailOpts {
  name?: string;
  items: ClosingSoonEmailItem[];
  to?: string;
}

/** Weekly closing-soon email. Verified rows only; no match language. */
export function renderClosingSoonEmail(opts: ClosingSoonEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const count = opts.items.length;
  const countLabel =
    count === 1 ? '1 settlement closing soon' : `${count} settlements closing soon`;
  const cards = opts.items
    .map((item) => {
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
        <tr>
          <td style="padding:20px 22px;">
            <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(item.title)}</div>
            <div style="font-size:13px;color:#6b6480;margin-top:8px;">Listed deadline: ${esc(formatDeadline(item.deadline))}</div>
            <div style="margin-top:16px;">
              <a href="${lawsuitUrl(item.slug)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Review this settlement →</a>
            </div>
          </td>
        </tr>
      </table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(countLabel)}</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">${esc(countLabel)}</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} these verified listings have a claim deadline in the next 14 days. Check the official notice and file there yourself if you qualify. ClaimMatch never files for you.</p>
          ${cards}
        </td></tr>
        ${footerNote(`You're receiving this because you opted in to emails from ${SITE.name}.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send the closing-soon email. Refuses unless CLOSING_SOON_EMAIL_ENABLED=1
 * and a postal address plus verified sender are configured. Tests must mock
 * Resend — this function never sends when the gate fails.
 */
export async function sendClosingSoonEmail(to: string, opts: ClosingSoonEmailOpts): Promise<void> {
  const gate = closingSoonEmailGate();
  if (!gate.ok) {
    console.log(`[email] closing-soon email refused (${gate.reason})`);
    return;
  }
  if (!to || !opts?.items?.length) return;
  const resend = getResend();
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping closing-soon email to ${to}.`);
    return;
  }
  const from = process.env.RESEND_FROM || FROM;
  try {
    await resend.emails.send({
      from,
      to,
      subject:
        opts.items.length === 1
          ? `A settlement closing soon on ${SITE.name}`
          : `${opts.items.length} settlements closing soon on ${SITE.name}`,
      html: renderClosingSoonEmail({ ...opts, to }),
    });
  } catch (err) {
    console.error(`[email] Failed to send closing-soon email to ${to}:`, err);
  }
}

export type DeadlineReminderEmailKind = '7d' | '1d';

export interface DeadlineReminderEmailOpts {
  name?: string;
  title: string;
  slug: string;
  deadline: string;
  kind: DeadlineReminderEmailKind;
  to?: string;
}

export function renderDeadlineReminderEmail(opts: DeadlineReminderEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const when = opts.kind === '1d' ? 'tomorrow' : 'in 7 days';
  const subjectLine =
    opts.kind === '1d' ? 'A tracked settlement deadline is tomorrow' : 'A tracked settlement deadline is in 7 days';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subjectLine)}</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">${esc(subjectLine)}</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} a settlement you are tracking has a listed claim deadline ${esc(when)}. Check the official notice and file there yourself if you qualify. ${esc(SITE.name)} never files for you.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
            <tr>
              <td style="padding:20px 22px;">
                <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(opts.title)}</div>
                <div style="font-size:13px;color:#6b6480;margin-top:8px;">Listed deadline: ${esc(formatDeadline(opts.deadline))}</div>
                <div style="margin-top:16px;">
                  <a href="${lawsuitUrl(opts.slug)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Review this settlement →</a>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">See your tracked claims on your <a href="${SITE.url.replace(/\/$/, '')}/dashboard" style="color:${BRAND};text-decoration:underline;">dashboard</a>.</p>
        </td></tr>
        ${footerNote(`You're receiving this because you opted in to emails from ${SITE.name} and are tracking this settlement.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send a 7-day or 1-day claim deadline reminder. Returns true only when Resend
 * accepted the send, so the caller can record idempotency after a real send.
 */
export async function sendDeadlineReminderEmail(
  to: string,
  opts: DeadlineReminderEmailOpts,
): Promise<boolean> {
  if (!to || !opts?.slug || !opts.deadline) return false;
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping deadline reminder.');
    return false;
  }
  const subject =
    opts.kind === '1d'
      ? `A tracked settlement deadline is tomorrow on ${SITE.name}`
      : `A tracked settlement deadline is in 7 days on ${SITE.name}`;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderDeadlineReminderEmail({ ...opts, to }),
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send deadline reminder:', err);
    return false;
  }
}

export interface IncompleteOnboardingEmailOpts {
  name?: string;
  to?: string;
}

export function renderIncompleteOnboardingEmail(opts: IncompleteOnboardingEmailOpts = {}): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finish your ${esc(SITE.name)} profile</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">Finish your profile</h1>
          <p style="margin:0 0 18px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} you started a ${esc(SITE.name)} account but have not finished your profile. A few answers help us find open US settlements that may apply to you. You still file on the official site yourself — ${esc(SITE.name)} never files for you.</p>
          <div>
            <a href="${onboardingUrl()}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">Complete your profile →</a>
          </div>
          <p style="margin:20px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">It takes about two minutes. You can skip any question you do not want to answer.</p>
        </td></tr>
        ${footerNote(`You're receiving this because you signed up at ${SITE.name} and opted in to email.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface DidYouFileEmailOpts {
  name?: string;
  title: string;
  slug: string;
  to?: string;
}

export function renderDidYouFileEmail(opts: DidYouFileEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const href = claimPageUrl(opts.slug);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Did you file this settlement claim?</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">Did you file this claim?</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} a few days ago you opened the official claim form for a settlement you are tracking. If you already submitted it on the official site, tell us so we can keep it on your dashboard. If not, you can still file there yourself. ${esc(SITE.name)} never files for you.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
            <tr>
              <td style="padding:20px 22px;">
                <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(opts.title)}</div>
                <div style="margin-top:16px;">
                  <a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">I filed this claim →</a>
                </div>
                <div style="margin-top:12px;">
                  <a href="${href}" style="color:${BRAND};font-size:13px;text-decoration:underline;">Review this settlement</a>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
        ${footerNote(`You're receiving this because you opted in to emails from ${SITE.name} and started a claim.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Incomplete-onboarding drip. Returns true only when Resend accepted the send.
 * Refuses without a postal address and a verified sender (same helpers as
 * closing-soon). Tests must mock Resend — this never sends when the gate fails.
 */
export async function sendIncompleteOnboardingEmail(
  to: string,
  opts: IncompleteOnboardingEmailOpts = {},
): Promise<boolean> {
  if (!to) return false;
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    console.log(`[email] incomplete-onboarding email refused (${gate.reason})`);
    return false;
  }
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping incomplete-onboarding email.');
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Finish your ${SITE.name} profile`,
      html: renderIncompleteOnboardingEmail({ ...opts, to }),
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send incomplete-onboarding email:', err);
    return false;
  }
}

/**
 * "Did you file?" drip. Returns true only when Resend accepted the send.
 * Deep-links to the claim page. Same sender/postal refuse as closing-soon.
 */
export async function sendDidYouFileEmail(to: string, opts: DidYouFileEmailOpts): Promise<boolean> {
  if (!to || !opts?.slug) return false;
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    console.log(`[email] did-you-file email refused (${gate.reason})`);
    return false;
  }
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping did-you-file email.');
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Did you file your ${opts.title} claim?`,
      html: renderDidYouFileEmail({ ...opts, to }),
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send did-you-file email:', err);
    return false;
  }
}

export type PayoutTrackerEmailKind = 'hearing_passed' | 'payment_timing';

export interface PayoutTrackerEmailOpts {
  name?: string;
  title: string;
  slug: string;
  kind: PayoutTrackerEmailKind;
  hearingAt?: string | null;
  paymentTimingText?: string | null;
  to?: string;
}

export function renderPayoutTrackerEmail(opts: PayoutTrackerEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const hearing =
    opts.kind === 'hearing_passed' && opts.hearingAt
      ? `Listed hearing date: ${esc(formatDeadline(opts.hearingAt))}`
      : null;
  const timing =
    opts.kind === 'payment_timing' && opts.paymentTimingText
      ? `Listed payment timing: ${esc(opts.paymentTimingText.trim())}`
      : null;
  const heading =
    opts.kind === 'hearing_passed'
      ? 'A listed hearing date has passed'
      : 'Payment timing update';
  const intro =
    opts.kind === 'hearing_passed'
      ? `${greeting} the settlement you reported filing has a listed final approval hearing date that has passed. Check the official site for the latest. ${esc(SITE.name)} does not guess payment dates and never files for you.`
      : `${greeting} there is a listed update on when payments may go out for a settlement you reported filing. This text comes from the settlement record. ${esc(SITE.name)} does not guess dates and never files for you.`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">${esc(heading)}</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
            <tr>
              <td style="padding:20px 22px;">
                <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(opts.title)}</div>
                ${hearing ? `<div style="font-size:13px;color:#6b6480;margin-top:8px;">${hearing}</div>` : ''}
                ${timing ? `<div style="font-size:13px;color:#6b6480;margin-top:8px;">${timing}</div>` : ''}
                <div style="margin-top:16px;">
                  <a href="${claimPageUrl(opts.slug)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Open your claim →</a>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">See your tracked claims on your <a href="${SITE.url.replace(/\/$/, '')}/dashboard" style="color:${BRAND};text-decoration:underline;">dashboard</a>.</p>
        </td></tr>
        ${footerNote(`You're receiving this because you opted in to emails from ${SITE.name} and reported filing this settlement.`, opts.to)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Hearing-passed or payment-timing email. Returns true only when Resend
 * accepted the send. Refuses without postal address and a verified sender.
 */
export async function sendPayoutTrackerEmail(
  to: string,
  opts: PayoutTrackerEmailOpts,
): Promise<boolean> {
  if (!to || !opts?.slug) return false;
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    console.log(`[email] payout-tracker email refused (${gate.reason})`);
    return false;
  }
  const resend = getResend();
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping payout-tracker email.');
    return false;
  }
  const subject =
    opts.kind === 'hearing_passed'
      ? `A listed hearing date has passed on ${SITE.name}`
      : `Payment timing update on ${SITE.name}`;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderPayoutTrackerEmail({ ...opts, to }),
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send payout-tracker email:', err);
    return false;
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
