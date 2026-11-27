/**
 * Daily flush of PIN-gated administrator emails that were requested while
 * PIN_ADMIN_EMAIL_ENABLED was off, or that failed to send. Default-off:
 * nothing is sent until the flag is exactly "1".
 */
import { flags } from '@/lib/flags';
import { officialSiteUrl } from '@/lib/lawsuit-display';
import { sendPinAdminEmailForClaim } from '@/lib/pin-admin-email-send';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getValidClaimUrl } from '@/lib/utils';

export interface PinAdminEmailJobResult {
  candidates: number;
  sent: number;
  skipped: string | null;
}

export async function sendQueuedPinAdminEmails(): Promise<PinAdminEmailJobResult> {
  const empty: PinAdminEmailJobResult = { candidates: 0, sent: 0, skipped: null };
  if (!flags.pinAdminEmail()) {
    return { ...empty, skipped: 'PIN_ADMIN_EMAIL_ENABLED is off' };
  }
  if (!isSupabaseConfigured()) return { ...empty, skipped: 'supabase is not configured' };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('claims')
    .select('id, user_id, lawsuit_id, lawsuit_title, notice_id, pin_admin_email_requested_at, pin_admin_email_sent_at')
    .not('pin_admin_email_requested_at', 'is', null)
    .is('pin_admin_email_sent_at', null);
  if (error) {
    throw new Error(`[pin-admin-email] loading claims failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    lawsuit_id: string;
    lawsuit_title: string | null;
    notice_id: string | null;
    pin_admin_email_requested_at: string | null;
    pin_admin_email_sent_at: string | null;
  }>;
  const pending = rows.filter((row) => !row.notice_id?.trim());
  if (pending.length === 0) return empty;

  const userIds = Array.from(new Set(pending.map((row) => row.user_id)));
  const lawsuitIds = Array.from(new Set(pending.map((row) => row.lawsuit_id)));
  const [{ data: profileData, error: profileError }, { data: lawsuitData, error: lawsuitError }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').in('id', userIds),
    supabase.from('lawsuits').select('id, slug, title, administrator, claim_url').in('id', lawsuitIds),
  ]);
  if (profileError) throw new Error(`[pin-admin-email] loading profiles failed: ${profileError.message}`);
  if (lawsuitError) throw new Error(`[pin-admin-email] loading lawsuits failed: ${lawsuitError.message}`);

  const profiles = new Map(
    ((profileData ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map((row) => [row.id, row]),
  );
  const lawsuits = new Map(
    ((lawsuitData ?? []) as Array<{
      id: string;
      slug: string;
      title: string | null;
      administrator: string | null;
      claim_url: string | null;
    }>).map((row) => [row.id, row]),
  );

  let sent = 0;
  let candidates = 0;
  for (const row of pending) {
    const profile = profiles.get(row.user_id);
    const lawsuit = lawsuits.get(row.lawsuit_id);
    if (!profile?.email || !lawsuit?.slug) continue;
    candidates += 1;
    const result = await sendPinAdminEmailForClaim({
      userId: row.user_id,
      claimId: row.id,
      title: lawsuit.title || row.lawsuit_title || 'this settlement',
      slug: lawsuit.slug,
      administrator: lawsuit.administrator,
      officialHref: officialSiteUrl(getValidClaimUrl(lawsuit.claim_url) ?? lawsuit.claim_url),
      senderName: profile.full_name?.trim() || profile.email,
      senderEmail: profile.email,
    });
    if (result.status === 'sent') sent += 1;
  }

  return { candidates, sent, skipped: null };
}
