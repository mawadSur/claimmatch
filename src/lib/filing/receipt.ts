import { SITE } from '@/lib/utils';
import { SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { legalContact } from '@/lib/legal-contact';
import { unsubscribePageUrl } from '@/lib/unsubscribe';

const BRAND = '#7526d1';
const FROM = process.env.RESEND_FROM || 'ClaimMatch <onboarding@resend.dev>';

export interface FilingReceiptOpts {
  to: string;
  name?: string;
  lawsuitTitle: string;
  administratorClaimId: string;
  screenshotUrl?: string | null;
}

function getResend(): { emails: { send: (o: unknown) => Promise<unknown> } } | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
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

export function renderFilingReceiptEmail(opts: FilingReceiptOpts): string {
  const greeting = opts.name ? `Hi ${esc(opts.name)},` : 'Hi there,';
  const dashboard = `${SITE.url.replace(/\/$/, '')}/dashboard`;
  const postal = legalContact().postalAddress;
  const unsub = ` <a href="${unsubscribePageUrl(opts.to)}" style="color:#8b859e;text-decoration:underline;">Unsubscribe</a>`;
  const screenshot = opts.screenshotUrl
    ? `<p style="margin:16px 0 0 0;font-size:13px;color:#6b6480;">A confirmation image is stored on your claim. Open your dashboard to review it.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorized submission confirmation</title></head>
<body style="margin:0;padding:0;background:#f6f4fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">
          <span style="font-size:22px;font-weight:800;color:${BRAND};font-family:Georgia,'Times New Roman',serif;">${esc(SITE.name)}</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece7f6;">
          <h1 style="margin:0 0 6px 0;font-size:20px;color:#171326;font-family:Georgia,'Times New Roman',serif;">Authorized submission confirmation</h1>
          <p style="margin:0 0 16px 0;font-size:15px;color:#43405a;line-height:1.55;">${greeting} ClaimMatch sent the official form for <strong>${esc(opts.lawsuitTitle)}</strong> using the authorization you signed.</p>
          <p style="margin:0 0 8px 0;font-size:15px;color:#43405a;line-height:1.55;">Administrator confirmation id: <strong>${esc(opts.administratorClaimId)}</strong></p>
          ${screenshot}
          <div style="margin-top:20px;">
            <a href="${dashboard}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">View your claims →</a>
          </div>
        </td></tr>
        <tr><td style="padding:22px 8px 0 8px;">
          <p style="margin:0 0 12px 0;font-size:11px;color:#8b859e;line-height:1.5;">${esc(SHORT_DISCLAIMER)}</p>
          ${postal ? `<p style="margin:0 0 8px 0;font-size:11px;color:#a29cb5;line-height:1.5;">${esc(postal)}</p>` : ''}
          <p style="margin:0;font-size:11px;color:#a29cb5;line-height:1.5;">You're receiving this because you authorized a submission on ${esc(SITE.name)}.${unsub}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Email the confirmation of an authorized submission. No-ops without Resend. */
export async function sendFilingReceiptEmail(opts: FilingReceiptOpts): Promise<void> {
  if (!opts.to || !opts.administratorClaimId) return;
  const resend = getResend();
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping filing confirmation to ${opts.to}.`);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: `Authorized submission confirmation on ${SITE.name}`,
      html: renderFilingReceiptEmail(opts),
    });
  } catch (err) {
    console.error(`[email] Failed to send filing confirmation to ${opts.to}:`, err);
  }
}
