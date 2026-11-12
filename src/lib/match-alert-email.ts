/**
 * Match-alert email HTML and Resend send. Existing template style (tables,
 * brand purple), not a new React Email package. Never invents fees or payouts.
 */
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { OFFICIAL_FILING_IS_FREE } from '@/lib/copy';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { legalContact } from '@/lib/legal-contact';
import {
  MATCH_ALERT_MAX_CLAIMS,
  matchAlertSendBlocked,
  type MatchAlertClaim,
} from '@/lib/match-alert';
import { matchAlertStartPath } from '@/lib/match-alert-token';
import { listUnsubscribeHeaders, unsubscribePageUrl } from '@/lib/unsubscribe';
import { SITE, formatDeadline } from '@/lib/utils';

const BRAND = '#7526d1';
const FROM = process.env.RESEND_FROM || 'ClaimMatch <onboarding@resend.dev>';

export interface MatchAlertEmailClaim extends MatchAlertClaim {
  startUrl: string;
}

export interface MatchAlertEmailOpts {
  name?: string | null;
  to: string;
  claims: MatchAlertEmailClaim[];
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getResend(): { emails: { send: (o: unknown) => Promise<unknown> } } | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const { Resend } = require('resend');
    return new Resend(key);
  } catch (err) {
    console.warn('[match-alert] Resend unavailable:', err);
    return null;
  }
}

export function renderMatchAlertEmail(opts: MatchAlertEmailOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const claims = opts.claims.slice(0, MATCH_ALERT_MAX_CLAIMS);
  const countLabel = claims.length === 1 ? 'a verified settlement' : `${claims.length} verified settlements`;
  const cards = claims
    .map((claim) => {
      const why = claim.reasons[0]
        ? `Why it may match: ${esc(claim.reasons[0])}`
        : 'This listing is open and may apply to the details you shared.';
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #ece7f6;border-radius:12px;background:#ffffff;">
        <tr>
          <td style="padding:20px 22px;">
            <div style="font-size:17px;font-weight:700;color:#171326;line-height:1.35;font-family:Georgia,'Times New Roman',serif;">${esc(claim.title)}</div>
            <div style="font-size:13px;color:#6b6480;margin-top:8px;">Deadline: ${esc(formatDeadline(claim.deadline))}</div>
            <div style="font-size:13px;color:#6b6480;margin-top:6px;">${why}</div>
            <div style="margin-top:16px;">
              <a href="${esc(claim.startUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Start this claim</a>
            </div>
          </td>
        </tr>
      </table>`;
    })
    .join('');

  const postal = legalContact().postalAddress;
  const unsub = unsubscribePageUrl(opts.to);
  const money = `${SITE.url.replace(/\/$/, '')}/how-we-make-money`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New settlement match</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">A new match to review</h1>
          <p style="margin:0 0 20px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} we found ${esc(countLabel)} that may apply to you. Check the official notice and file there yourself if you qualify. ${esc(SITE.name)} never files for you and does not promise a payment.</p>
          ${cards}
          <p style="margin:22px 0 0 0;font-size:13px;color:#6b6480;line-height:1.5;">${esc(OFFICIAL_FILING_IS_FREE)} <a href="${esc(money)}" style="color:${BRAND};text-decoration:underline;">How we make money</a>.</p>
        </td></tr>
        <tr><td style="padding:22px 8px 0 8px;">
          <p style="margin:0 0 12px 0;font-size:11px;color:#8b859e;line-height:1.5;">${esc(SHORT_DISCLAIMER)}</p>
          <p style="margin:0 0 8px 0;font-size:11px;color:#a29cb5;line-height:1.5;">${esc(SITE.name)}${postal ? `<br>${esc(postal)}` : ''}</p>
          <p style="margin:0;font-size:11px;color:#a29cb5;line-height:1.5;">This is a commercial email. You're receiving this because you opted in to match alerts from ${esc(SITE.name)}. <a href="${esc(unsub)}" style="color:#8b859e;text-decoration:underline;">Unsubscribe</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function matchAlertSubject(claims: MatchAlertClaim[]): string {
  if (claims.length === 1) return `A new settlement match on ${SITE.name}`;
  return `${claims.length} new settlement matches on ${SITE.name}`;
}

export function previewMatchAlertEmail(to: string, name?: string | null): string {
  const site = SITE.url.replace(/\/$/, '') || 'https://lawsuitai.org';
  const claims: MatchAlertEmailClaim[] = [
    {
      lawsuitId: '00000000-0000-4000-8000-000000000001',
      slug: 'sample-data-breach',
      title: 'Sample data-breach settlement',
      deadline: '2027-06-30',
      reasons: ['Available in your state (CA)'],
      score: 0.75,
      startUrl: `${site}/claim/sample-data-breach`,
    },
    {
      lawsuitId: '00000000-0000-4000-8000-000000000002',
      slug: 'sample-consumer-product',
      title: 'Sample consumer product settlement',
      deadline: '2027-08-15',
      reasons: ['Open nationwide'],
      score: 0.5,
      startUrl: `${site}/claim/sample-consumer-product`,
    },
  ];
  return renderMatchAlertEmail({ to, name: name ?? 'Alex', claims });
}

/**
 * Send a match-alert email. Returns true only when Resend accepted the send.
 * Never sends from tests/CI, when the flag is off, or without commercial
 * prereqs (postal address, verified RESEND_FROM, API key).
 */
export async function sendMatchAlertEmail(opts: MatchAlertEmailOpts): Promise<boolean> {
  const blocked = matchAlertSendBlocked();
  if (blocked.blocked) {
    console.log(`[match-alert] send refused (${blocked.reason})`);
    return false;
  }
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    console.log(`[match-alert] send refused (${gate.reason})`);
    return false;
  }
  if (!opts.to || !opts.claims.length) return false;
  const resend = getResend();
  if (!resend) {
    console.log('[match-alert] RESEND_API_KEY not set — skipping send.');
    return false;
  }
  const from = process.env.RESEND_FROM || FROM;
  const headers = listUnsubscribeHeaders(opts.to);
  try {
    await resend.emails.send({
      from,
      to: opts.to,
      subject: matchAlertSubject(opts.claims),
      html: renderMatchAlertEmail(opts),
      headers,
    });
    return true;
  } catch (err) {
    console.error('[match-alert] Failed to send:', err instanceof Error ? err.name : 'unknown');
    return false;
  }
}

export function startUrlsForClaims(
  claims: MatchAlertClaim[],
  tokens: string[],
  siteUrl: string,
): MatchAlertEmailClaim[] {
  return claims.map((claim, i) => ({
    ...claim,
    startUrl: matchAlertStartPath(tokens[i] ?? '', siteUrl),
  }));
}
