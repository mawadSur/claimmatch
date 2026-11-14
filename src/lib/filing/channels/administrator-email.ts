/**
 * administrator_email (worker channel): one email per claim to the
 * administrator's published claims address, through Resend
 * (src/lib/email.ts). The answers follow the official form's order with its
 * labels, then the member's e-signature block (typed name, time in UTC and
 * Eastern, packet hash, the statement verbatim). Stored proof is attached
 * after re-hashing; the member gets the exact copy (CC).
 *
 * Never sent twice automatically: Resend's Idempotency-Key is the job's key,
 * and any failure once Resend was called is needs_attention for a person.
 * Header injection: every header value is one line, addresses are checked.
 */
import { createHash } from 'node:crypto';
import { sendTransactionalEmail } from '@/lib/email-transactional';
import { PUBLIC_BRAND } from '@/lib/utils';
import type { CanonicalPacket } from '../v2/contract';
import { AdministratorEmailConfigSchema, type FilingSpecContent } from '../v2/contract-spec';
import { documentLabel, orderedPacketFields } from './packet-fields';
import { isPlainAddress } from './support';
import type { ChannelSubmitInput, ChannelSubmitResult, SignatureBlock } from './types';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
/** Reading a stored file failed this many times: a person looks instead of another try. */
const MAX_READ_ATTEMPTS = 3;

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** One line, no control characters: safe in a mail header. */
export function headerSafe(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sha256OfBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function signedAtText(iso: string): { utc: string; eastern: string } {
  const at = new Date(iso);
  const utc = `${at.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'long',
    timeStyle: 'long',
  }).format(at);
  return { utc, eastern };
}

export interface AdministratorEmailParts {
  settlementTitle: string;
  packet: CanonicalPacket;
  spec: FilingSpecContent;
  signature: SignatureBlock;
  /** Lawsuit AI's reference for this filing (the job id). */
  reference: string;
  subjectPrefix: string | null;
  attachments: Array<{ filename: string; label: string; size_bytes: number }>;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function renderAdministratorEmail(parts: AdministratorEmailParts): RenderedEmail {
  const { packet, signature } = parts;
  const name = packet.member.legal_name;
  const subject = headerSafe(
    `${parts.subjectPrefix ? `${parts.subjectPrefix} ` : ''}Claim form: ${parts.settlementTitle} - ${name}`,
    240,
  );
  const fields = orderedPacketFields(packet, parts.spec);
  const at = signedAtText(signature.signed_at);
  const intro = [
    `${PUBLIC_BRAND} is delivering this completed claim form as the authorized agent of the claimant named below, for this one claim only.`,
    'The claimant entered or confirmed every answer, read the statement on the official claim form and signed it electronically (signature block below).',
    `Any payment on this claim belongs to the claimant. ${PUBLIC_BRAND} does not receive or handle settlement payments.`,
    `Questions about this claim: reply to this email, or contact the claimant at ${packet.member.email}.`,
  ];
  const statementHtml = esc(signature.statement_text).replace(/\r?\n/g, '<br>');
  const cell = 'padding:6px 10px;border:1px solid #ddd;vertical-align:top;font-size:14px;';
  const rows = fields
    .map((f) => `<tr><td style="${cell}"><strong>${esc(f.label)}</strong></td><td style="${cell}">${esc(f.text) || '&nbsp;'}</td></tr>`)
    .join('\n');
  const attachmentLines = parts.attachments.map((a) => `${a.label}: ${a.filename} (${kb(a.size_bytes)})`);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;">
<h1 style="font-size:18px;">Claim form: ${esc(parts.settlementTitle)}</h1>
${intro.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<h2 style="font-size:16px;">Claim form answers</h2>
<table role="presentation" style="border-collapse:collapse;">
${rows}
</table>
<h2 style="font-size:16px;">Attached documents</h2>
<p>${attachmentLines.length ? attachmentLines.map(esc).join('<br>') : 'None.'}</p>
<h2 style="font-size:16px;">Electronic signature of the claimant</h2>
<p>Signature: /s/ ${esc(signature.typed_name)}<br>
Signed: ${esc(at.utc)} (${esc(at.eastern)})<br>
Signature record: ${esc(signature.signature_id)}<br>
SHA-256 of the signed claim record: ${esc(signature.packet_hash)}<br>
Agent authorization accepted at signing: version ${esc(signature.authorization_text_version)}</p>
<p><strong>Statement signed, verbatim from the claim form:</strong><br>${statementHtml}</p>
<p style="color:#555;font-size:12px;">${esc(PUBLIC_BRAND)} reference: ${esc(parts.reference)}</p>
</body></html>`;

  const text = [
    `Claim form: ${parts.settlementTitle}`,
    '',
    ...intro,
    '',
    'CLAIM FORM ANSWERS',
    ...fields.map((f) => `${f.label}: ${f.text}`),
    '',
    'ATTACHED DOCUMENTS',
    ...(attachmentLines.length ? attachmentLines : ['None.']),
    '',
    'ELECTRONIC SIGNATURE OF THE CLAIMANT',
    `Signature: /s/ ${signature.typed_name}`,
    `Signed: ${at.utc} (${at.eastern})`,
    `Signature record: ${signature.signature_id}`,
    `SHA-256 of the signed claim record: ${signature.packet_hash}`,
    `Agent authorization accepted at signing: version ${signature.authorization_text_version}`,
    '',
    'Statement signed, verbatim from the claim form:',
    signature.statement_text,
    '',
    `${PUBLIC_BRAND} reference: ${parts.reference}`,
  ].join('\n');
  return { subject, html, text };
}

const attention = (reason_code: string, detail: string | null = null): ChannelSubmitResult => ({
  status: 'needs_attention',
  reason_code,
  detail,
});

export async function submitAdministratorEmail(input: ChannelSubmitInput<'administrator_email'>): Promise<ChannelSubmitResult> {
  const parsed = AdministratorEmailConfigSchema.safeParse(input.config);
  if (!parsed.success || ![parsed.data.to, ...parsed.data.cc].every(isPlainAddress)) {
    return attention('channel_config_invalid');
  }
  const config = parsed.data;
  const signed = input.packet.documents;
  if (signed.length > 0 && !config.attach_documents) return attention('documents_not_carried');

  // Re-hash every stored file before it leaves: bytes that differ from the signed packet are never sent.
  const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
  const listed: AdministratorEmailParts['attachments'] = [];
  let total = 0;
  for (const [index, doc] of signed.entries()) {
    const source = input.documents.find((d) => d.id === doc.id);
    if (!source || source.sha256 !== doc.sha256) return attention('document_missing', doc.id);
    let bytes: Uint8Array;
    try {
      bytes = await source.read();
    } catch {
      return input.job.attempt < MAX_READ_ATTEMPTS
        ? { status: 'not_sent', reason_code: 'document_unreadable', retry_safe: true }
        : attention('document_unreadable', doc.id);
    }
    if (sha256OfBytes(bytes) !== doc.sha256) return attention('document_hash_mismatch', doc.id);
    total += bytes.byteLength;
    if (total > config.max_total_attachment_bytes) return attention('attachments_too_large');
    const filename = `${doc.kind}-${index + 1}.${EXTENSION[doc.mime] ?? 'bin'}`;
    attachments.push({ filename, content: Buffer.from(bytes).toString('base64'), contentType: doc.mime });
    listed.push({ filename, label: documentLabel(input.spec.content, doc.kind), size_bytes: bytes.byteLength });
  }

  const rendered = renderAdministratorEmail({
    settlementTitle: input.settlement.title,
    packet: input.packet,
    spec: input.spec.content,
    signature: input.signature,
    reference: input.job.id,
    subjectPrefix: config.subject_prefix ? headerSafe(config.subject_prefix, 120) : null,
    attachments: listed,
  });
  const to = config.to.toLowerCase();
  const cc = [...new Set([input.packet.member.email, ...config.cc].map((a) => a.trim().toLowerCase()))].filter(
    (a) => a !== to && isPlainAddress(a),
  );

  const sent = await sendTransactionalEmail({
    to: config.to,
    cc,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments,
    idempotencyKey: input.job.idempotency_key,
  });
  if (sent.status === 'not_configured') return { status: 'not_sent', reason_code: 'email_not_configured', retry_safe: true };
  if (sent.status === 'failed') return attention('email_send_failed', headerSafe(sent.error, 100));

  const sentAt = input.now.toISOString();
  return {
    status: 'filed',
    confirmation_number: null,
    evidence: [
      {
        kind: 'email',
        provider: 'resend',
        provider_message_id: sent.id ?? '',
        to: config.to,
        sent_at: sentAt,
        body_sha256: sha256OfBytes(JSON.stringify(rendered)),
        attachment_sha256s: signed.map((d) => d.sha256),
      },
    ],
    result: { channel: 'administrator_email', provider_message_id: sent.id, cc_count: cc.length, attachments: signed.length },
  };
}
