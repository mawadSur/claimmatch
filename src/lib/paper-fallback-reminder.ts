/**
 * 7-day paper-form fallback reminder after a notice-ID request has no
 * recorded notice ID. PAPER_FALLBACK_REMINDER_ENABLED (default off) gates
 * this drip and the paper_fallback_at stamp. The claim/dashboard card is
 * gated separately by PAPER_FALLBACK_UI_ENABLED.
 */
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { sendPaperFallbackEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { officialSiteUrl } from '@/lib/lawsuit-display';
import { isDripEligibleProfile } from '@/lib/onboarding-drip';
import {
  paperFallbackAfterDays,
  paperFallbackDue,
  paperFormHref,
} from '@/lib/pin-admin-email';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getValidClaimUrl, SITE } from '@/lib/utils';

export const PAPER_FALLBACK_KIND = 'paper_fallback' as const;

export interface PaperFallbackCandidate {
  userId: string;
  email: string;
  name: string | null;
  claimId: string;
  slug: string;
  title: string;
  formHref: string;
  days: number;
}

export interface PaperFallbackResult {
  candidates: number;
  emailed: number;
  skipped: string | null;
}

export function pickPaperFallback(row: {
  userId: string;
  email: string;
  name?: string | null;
  claimId: string;
  slug: string;
  title: string;
  notice_id?: string | null;
  pin_admin_email_sent_at?: string | null;
  pin_admin_email_requested_at?: string | null;
  formUrl?: string | null;
  officialHref?: string | null;
  alreadySent: boolean;
  now: Date;
  days?: number;
}): PaperFallbackCandidate | null {
  if (row.alreadySent) return null;
  if (!isDripEligibleProfile({ email_opt_in: true, email: row.email })) return null;
  if (
    !paperFallbackDue({
      notice_id: row.notice_id,
      pin_admin_email_sent_at: row.pin_admin_email_sent_at,
      pin_admin_email_requested_at: row.pin_admin_email_requested_at,
      now: row.now,
      days: row.days,
    })
  ) {
    return null;
  }
  return {
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    claimId: row.claimId,
    slug: row.slug,
    title: row.title,
    formHref: paperFormHref({ formUrl: row.formUrl, officialHref: row.officialHref, slug: row.slug }),
    days: row.days ?? paperFallbackAfterDays(),
  };
}

export async function sendPaperFallbackReminders(opts: { now?: Date } = {}): Promise<PaperFallbackResult> {
  const empty: PaperFallbackResult = { candidates: 0, emailed: 0, skipped: null };
  if (!flags.paperFallbackReminder()) {
    return { ...empty, skipped: 'PAPER_FALLBACK_REMINDER_ENABLED is off' };
  }
  const gate = commercialEmailPrereqs();
  if (!gate.ok) return { ...empty, skipped: gate.reason };
  if (!isSupabaseConfigured()) return { ...empty, skipped: 'supabase is not configured' };

  const now = opts.now ?? new Date();
  const days = paperFallbackAfterDays();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('claims')
    .select(
      'id, user_id, lawsuit_id, lawsuit_title, notice_id, pin_admin_email_requested_at, pin_admin_email_sent_at, paper_fallback_at',
    )
    .not('pin_admin_email_requested_at', 'is', null)
    .is('notice_id', null);
  if (error) {
    throw new Error(`[paper-fallback] loading claims failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    lawsuit_id: string;
    lawsuit_title: string | null;
    notice_id: string | null;
    pin_admin_email_requested_at: string | null;
    pin_admin_email_sent_at: string | null;
    paper_fallback_at: string | null;
  }>;
  if (rows.length === 0) return empty;

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const lawsuitIds = Array.from(new Set(rows.map((row) => row.lawsuit_id)));
  const claimIds = rows.map((row) => row.id);

  const [{ data: profileData, error: profileError }, { data: lawsuitData, error: lawsuitError }, { data: sentData, error: sentError }] =
    await Promise.all([
      supabase.from('profiles').select('id, email, full_name, email_opt_in').in('id', userIds),
      supabase.from('lawsuits').select('id, slug, title, claim_url, claim_action').in('id', lawsuitIds),
      supabase.from('drip_email_sends').select('user_id, claim_id').eq('kind', PAPER_FALLBACK_KIND).in('claim_id', claimIds),
    ]);
  if (profileError) throw new Error(`[paper-fallback] loading profiles failed: ${profileError.message}`);
  if (lawsuitError) throw new Error(`[paper-fallback] loading lawsuits failed: ${lawsuitError.message}`);
  if (sentError) throw new Error(`[paper-fallback] loading drip log failed: ${sentError.message}`);

  const profiles = new Map(
    ((profileData ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      email_opt_in: boolean | null;
    }>).map((row) => [row.id, row]),
  );
  const lawsuits = new Map(
    ((lawsuitData ?? []) as Array<{
      id: string;
      slug: string;
      title: string | null;
      claim_url: string | null;
      claim_action: { form_url?: string | null } | null;
    }>).map((row) => [row.id, row]),
  );
  const sent = new Set(
    ((sentData ?? []) as Array<{ user_id: string; claim_id: string | null }>)
      .filter((row) => row.claim_id)
      .map((row) => `${row.user_id}:${row.claim_id}`),
  );

  const candidates: PaperFallbackCandidate[] = [];
  for (const row of rows) {
    const profile = profiles.get(row.user_id);
    const lawsuit = lawsuits.get(row.lawsuit_id);
    if (!profile?.email || !lawsuit?.slug) continue;
    if (!profile.email_opt_in) continue;
    const picked = pickPaperFallback({
      userId: row.user_id,
      email: profile.email,
      name: profile.full_name,
      claimId: row.id,
      slug: lawsuit.slug,
      title: lawsuit.title || row.lawsuit_title || 'this settlement',
      notice_id: row.notice_id,
      pin_admin_email_sent_at: row.pin_admin_email_sent_at,
      pin_admin_email_requested_at: row.pin_admin_email_requested_at,
      formUrl: lawsuit.claim_action?.form_url ?? null,
      officialHref: officialSiteUrl(getValidClaimUrl(lawsuit.claim_url) ?? lawsuit.claim_url),
      alreadySent: sent.has(`${row.user_id}:${row.id}`),
      now,
      days,
    });
    if (picked) candidates.push(picked);
  }

  let emailed = 0;
  for (const candidate of candidates) {
    const formUrl = candidate.formHref.startsWith('http')
      ? candidate.formHref
      : `${SITE.url.replace(/\/$/, '')}${candidate.formHref}`;
    const claimUrl = `${SITE.url.replace(/\/$/, '')}/claim/${encodeURIComponent(candidate.slug)}`;
    const sentOk = await sendPaperFallbackEmail(candidate.email, {
      name: candidate.name ?? undefined,
      title: candidate.title,
      slug: candidate.slug,
      days: candidate.days,
      formUrl,
      claimUrl,
      to: candidate.email,
    });
    if (!sentOk) continue;
    await supabase.rpc('claim_record_paper_fallback', {
      p_user_id: candidate.userId,
      p_claim_id: candidate.claimId,
    });
    const { error: writeError } = await supabase.from('drip_email_sends').insert({
      user_id: candidate.userId,
      kind: PAPER_FALLBACK_KIND,
      claim_id: candidate.claimId,
    });
    if (writeError && writeError.code !== '23505') {
      console.error('[paper-fallback] send log failed:', writeError.message);
    }
    emailed += 1;
  }

  return { candidates: candidates.length, emailed, skipped: null };
}
