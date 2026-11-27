/**
 * Send (or queue) the PIN-gated administrator email for one claim. Server
 * only. PIN_ADMIN_EMAIL_ENABLED must be on before Resend is called.
 */
import { sendTransactionalEmail } from '@/lib/email-transactional';
import { flags } from '@/lib/flags';
import { isPlainAddress } from '@/lib/filing/channels/support';
import { pinAdminAdministratorEmail } from '@/lib/pin-admin-email';
import { createServiceClient } from '@/lib/supabase/server';
import { toClaimView } from '@/lib/claims';
import type { ClaimView } from '@/lib/claim-input';

export interface PinAdminSendInput {
  userId: string;
  claimId: string;
  title: string;
  slug: string;
  administrator?: string | null;
  officialHref?: string | null;
  senderName: string;
  senderEmail: string;
}

export type PinAdminSendResult =
  | { status: 'queued'; claim: ClaimView }
  | { status: 'sent'; claim: ClaimView }
  | { status: 'no_address'; claim: ClaimView }
  | { status: 'failed'; claim: ClaimView; error: string };

export async function recordPinAdminEmailRequest(userId: string, lawsuitId: string): Promise<ClaimView | null> {
  const { data, error } = await createServiceClient().rpc('claim_request_pin_admin_email', {
    p_user_id: userId,
    p_lawsuit_id: lawsuitId,
  });
  if (error || !data) return null;
  return toClaimView(data as Record<string, unknown>);
}

export async function sendPinAdminEmailForClaim(input: PinAdminSendInput): Promise<PinAdminSendResult> {
  const claim = await loadClaim(input.userId, input.claimId);
  if (!claim) return { status: 'failed', claim: emptyClaim(input), error: 'claim_not_found' };
  if (claim.notice_id?.trim()) return { status: 'queued', claim };
  if (claim.pin_admin_email_sent_at) return { status: 'sent', claim };

  const rendered = pinAdminAdministratorEmail({
    title: input.title,
    slug: input.slug,
    administrator: input.administrator,
    officialHref: input.officialHref,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
  });
  if (!rendered || !isPlainAddress(rendered.to) || !isPlainAddress(input.senderEmail)) {
    await recordSent(input.userId, input.claimId, null, 'no_administrator_email');
    return { status: 'no_address', claim: (await loadClaim(input.userId, input.claimId)) ?? claim };
  }

  if (!flags.pinAdminEmail()) {
    return { status: 'queued', claim };
  }

  const sent = await sendTransactionalEmail({
    to: rendered.to,
    cc: isPlainAddress(input.senderEmail) ? [input.senderEmail] : undefined,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `pin-admin-email:${input.claimId}`,
  });

  if (sent.status === 'sent') {
    const next = await recordSent(input.userId, input.claimId, sent.id ?? 'sent', null);
    return { status: 'sent', claim: next ?? claim };
  }
  if (sent.status === 'not_configured') {
    return { status: 'queued', claim };
  }
  const next = await recordSent(input.userId, input.claimId, null, sent.error);
  return { status: 'failed', claim: next ?? claim, error: sent.error };
}

async function loadClaim(userId: string, claimId: string): Promise<ClaimView | null> {
  const { data, error } = await createServiceClient()
    .from('claims')
    .select('*')
    .eq('id', claimId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return toClaimView(data as Record<string, unknown>);
}

async function recordSent(
  userId: string,
  claimId: string,
  providerId: string | null,
  error: string | null,
): Promise<ClaimView | null> {
  const { data, error: rpcError } = await createServiceClient().rpc('claim_record_pin_admin_email_sent', {
    p_user_id: userId,
    p_claim_id: claimId,
    p_provider_id: providerId,
    p_error: error,
  });
  if (rpcError || !data) return null;
  return toClaimView(data as Record<string, unknown>);
}

function emptyClaim(input: PinAdminSendInput): ClaimView {
  return {
    id: input.claimId,
    lawsuit_id: '',
    lawsuit_title: input.title,
    status: 'self_file',
    confirmation_number: null,
    reported_filed_at: null,
    user_filed_on: null,
    corrective_notice_answered_at: null,
    corrective_notice_required: false,
    created_at: null,
  };
}
