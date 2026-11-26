/**
 * One-shot guest match-results email. Transactional only: no subscriber row,
 * no marketing opt-in, no further mail unless the person creates an account
 * and turns on alerts.
 */

import { PUBLIC_BRAND, SITE, formatDeadline } from '@/lib/utils';
import { FILE_OR_EASY_SUBMIT } from '@/lib/copy';
import type { MatchPreviewResult } from '@/lib/match-preview';
import { matchPreviewSharePath, type MatchPreviewDraft } from '@/lib/match-preview';

export const GUEST_MATCH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseGuestMatchEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !GUEST_MATCH_EMAIL_RE.test(email)) return null;
  return email;
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

export function guestMatchShareUrl(draft: MatchPreviewDraft): string {
  const path = matchPreviewSharePath(draft);
  return `${SITE.url.replace(/\/$/, '')}${path}`;
}

export function renderGuestMatchEmail(opts: {
  matches: MatchPreviewResult[];
  shareUrl: string;
}): { subject: string; html: string; text: string } {
  const count = opts.matches.length;
  const subject =
    count === 1
      ? `Your ${PUBLIC_BRAND} match result`
      : `Your ${PUBLIC_BRAND} match results (${count})`;
  const rows = opts.matches
    .map((m) => {
      const deadline = m.deadline ? formatDeadline(m.deadline) : 'No deadline listed';
      const payout = m.typical_payout?.trim() || 'See the official notice';
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #ece8f5;">
          <a href="${esc(lawsuitUrl(m.slug))}" style="color:#7526d1;font-weight:600;text-decoration:none;">${esc(m.title)}</a>
          <div style="margin-top:4px;font-size:13px;color:#43405a;">Payout as listed: ${esc(payout)} · Deadline: ${esc(deadline)}</div>
        </td>
      </tr>`;
    })
    .join('');
  const textRows = opts.matches
    .map((m) => {
      const deadline = m.deadline ? formatDeadline(m.deadline) : 'No deadline listed';
      const payout = m.typical_payout?.trim() || 'See the official notice';
      return `- ${m.title}\n  ${lawsuitUrl(m.slug)}\n  Payout as listed: ${payout}\n  Deadline: ${deadline}`;
    })
    .join('\n\n');
  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f7f5fb;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;padding:28px 32px;color:#1c1830;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:13px;color:#7526d1;font-weight:700;">${esc(PUBLIC_BRAND)}</p>
          <h1 style="margin:0 0 12px 0;font-size:22px;">Your match results</h1>
          <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#43405a;">
            You asked us to email these results. This is a one-time message. We did not subscribe you to marketing or match alerts.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          <p style="margin:20px 0 0 0;font-size:14px;line-height:1.55;color:#43405a;">
            Restore these answers later:<br>
            <a href="${esc(opts.shareUrl)}" style="color:#7526d1;">${esc(opts.shareUrl)}</a>
          </p>
          <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#8b859e;">
            ${esc(FILE_OR_EASY_SUBMIT)} Check each official notice before you file. ${esc(PUBLIC_BRAND)} is not a law firm and never handles settlement payments.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    `Your ${PUBLIC_BRAND} match results`,
    '',
    'You asked us to email these results. This is a one-time message. We did not subscribe you to marketing or match alerts.',
    '',
    textRows,
    '',
    `Restore these answers later: ${opts.shareUrl}`,
    '',
    FILE_OR_EASY_SUBMIT,
    `${PUBLIC_BRAND} is not a law firm and never handles settlement payments.`,
  ].join('\n');
  return { subject, html, text };
}
