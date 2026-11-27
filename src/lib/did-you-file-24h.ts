/**
 * 24-hour "Did you file?" email after a signed-in self-filer opened the
 * official form. Independent of ONBOARDING_DRIP_ENABLED (the 3-day drip).
 * Idempotent via drip_email_sends kind did_you_file_24h (user + lawsuit).
 */
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { sendDidYouFile24hEmail } from '@/lib/email';
import { filedPageUrl, filedSigningSecret, issueFiledToken } from '@/lib/filed-link';
import { flags } from '@/lib/flags';
import { isDripEligibleProfile, isAtLeastMsAgo } from '@/lib/onboarding-drip';
import { guidedDeadline, isMissingDeadlineOverrideColumn } from '@/lib/settlement-guides';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isDeadlinePassed, SITE } from '@/lib/utils';

export const DID_YOU_FILE_24H_KIND = 'did_you_file_24h' as const;
export const DID_YOU_FILE_24H_AFTER_MS = 24 * 60 * 60 * 1000;

const UNFILED = new Set(['self_file']);

export interface DidYouFile24hCandidate {
  userId: string;
  email: string;
  name: string | null;
  claimId: string;
  lawsuitId: string;
  slug: string;
  title: string;
}

export interface DidYouFile24hResult {
  candidates: number;
  emailed: number;
  skipped: string | null;
}

export function pickDidYouFile24h(row: {
  userId: string;
  email: string;
  name?: string | null;
  claimId: string;
  lawsuitId: string;
  status: string;
  slug: string;
  title: string;
  deadline: string | null;
  openedAt: string | null;
  alreadySent: boolean;
}, now: Date): DidYouFile24hCandidate | null {
  if (row.alreadySent) return null;
  if (!UNFILED.has(row.status)) return null;
  if (isDeadlinePassed(row.deadline, now)) return null;
  if (!isDripEligibleProfile({ email_opt_in: true, email: row.email })) return null;
  if (!isAtLeastMsAgo(row.openedAt, now, DID_YOU_FILE_24H_AFTER_MS)) return null;
  return {
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    claimId: row.claimId,
    lawsuitId: row.lawsuitId,
    slug: row.slug,
    title: row.title,
  };
}

export async function sendDidYouFile24hEmails(opts: { now?: Date } = {}): Promise<DidYouFile24hResult> {
  const empty: DidYouFile24hResult = { candidates: 0, emailed: 0, skipped: null };
  if (!flags.didYouFileEmail()) {
    return { ...empty, skipped: 'DID_YOU_FILE_EMAIL_ENABLED is off' };
  }
  const gate = commercialEmailPrereqs();
  if (!gate.ok) return { ...empty, skipped: gate.reason };
  if (!isSupabaseConfigured()) return { ...empty, skipped: 'supabase is not configured' };
  const secret = filedSigningSecret();
  if (!secret) return { ...empty, skipped: 'filed-link signing secret is not set' };

  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - DID_YOU_FILE_24H_AFTER_MS).toISOString();
  const supabase = createServiceClient();

  const { data: openRows, error: openError } = await supabase
    .from('official_form_opens')
    .select('user_id, lawsuit_id, opened_at')
    .lte('opened_at', cutoff);
  if (openError) {
    throw new Error(`[did-you-file-24h] loading opens failed: ${openError.message}`);
  }
  const opens = (openRows ?? []) as Array<{ user_id: string; lawsuit_id: string; opened_at: string }>;
  if (opens.length === 0) return empty;

  const userIds = Array.from(new Set(opens.map((row) => row.user_id)));
  const lawsuitIds = Array.from(new Set(opens.map((row) => row.lawsuit_id)));

  const [{ data: claimsData, error: claimError }, { data: profileData, error: profileError }, lawsuitResult, { data: sentData, error: sentError }] =
    await Promise.all([
      supabase
        .from('claims')
        .select('id, user_id, lawsuit_id, status')
        .in('user_id', userIds)
        .in('lawsuit_id', lawsuitIds)
        .eq('status', 'self_file'),
      supabase
        .from('profiles')
        .select('id, email, full_name, email_opt_in')
        .in('id', userIds)
        .eq('email_opt_in', true),
      (async () => {
        const full = await supabase
          .from('lawsuits')
          .select('id, slug, title, deadline, deadline_override')
          .in('id', lawsuitIds);
        if (full.error && isMissingDeadlineOverrideColumn(full.error.message)) {
          return supabase.from('lawsuits').select('id, slug, title, deadline').in('id', lawsuitIds);
        }
        return full;
      })(),
      supabase
        .from('drip_email_sends')
        .select('user_id, lawsuit_id')
        .eq('kind', DID_YOU_FILE_24H_KIND)
        .in('user_id', userIds),
    ]);
  if (claimError) throw new Error(`[did-you-file-24h] loading claims failed: ${claimError.message}`);
  if (profileError) throw new Error(`[did-you-file-24h] loading profiles failed: ${profileError.message}`);
  if (lawsuitResult.error) {
    throw new Error(`[did-you-file-24h] loading settlements failed: ${lawsuitResult.error.message}`);
  }
  if (sentError) throw new Error(`[did-you-file-24h] loading send log failed: ${sentError.message}`);

  const claims = (claimsData ?? []) as Array<{
    id: string;
    user_id: string;
    lawsuit_id: string;
    status: string;
  }>;
  const claimByPair = new Map(claims.map((row) => [`${row.user_id}:${row.lawsuit_id}`, row]));
  const profiles = new Map(
    ((profileData ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      email_opt_in: boolean;
    }>)
      .filter(isDripEligibleProfile)
      .map((row) => [row.id, row]),
  );
  const lawsuits = new Map(
    ((lawsuitResult.data ?? []) as Array<{
      id: string;
      slug: string;
      title: string;
      deadline: string | null;
      deadline_override?: string | null;
    }>).map((row) => [row.id, row]),
  );
  const sent = new Set(
    ((sentData ?? []) as Array<{ user_id: string; lawsuit_id: string | null }>)
      .filter((row) => row.lawsuit_id)
      .map((row) => `${row.user_id}:${row.lawsuit_id}`),
  );

  const candidates: DidYouFile24hCandidate[] = [];
  for (const open of opens) {
    const claim = claimByPair.get(`${open.user_id}:${open.lawsuit_id}`);
    const profile = profiles.get(open.user_id);
    const lawsuit = lawsuits.get(open.lawsuit_id);
    if (!claim || !profile?.email || !lawsuit) continue;
    const picked = pickDidYouFile24h(
      {
        userId: open.user_id,
        email: profile.email,
        name: profile.full_name,
        claimId: claim.id,
        lawsuitId: open.lawsuit_id,
        status: claim.status,
        slug: lawsuit.slug,
        title: lawsuit.title,
        deadline: guidedDeadline(lawsuit),
        openedAt: open.opened_at,
        alreadySent: sent.has(`${open.user_id}:${open.lawsuit_id}`),
      },
      now,
    );
    if (picked) candidates.push(picked);
  }

  let emailed = 0;
  for (const candidate of candidates) {
    const issued = issueFiledToken({
      userId: candidate.userId,
      lawsuitId: candidate.lawsuitId,
      claimId: candidate.claimId,
      now,
      secret,
    });
    const filedUrl = filedPageUrl(issued.token, SITE.url);
    const sentOk = await sendDidYouFile24hEmail(candidate.email, {
      name: candidate.name ?? undefined,
      title: candidate.title,
      slug: candidate.slug,
      filedUrl,
      to: candidate.email,
    });
    if (!sentOk) continue;
    const { error: writeError } = await supabase.from('drip_email_sends').insert({
      user_id: candidate.userId,
      kind: DID_YOU_FILE_24H_KIND,
      claim_id: candidate.claimId,
      lawsuit_id: candidate.lawsuitId,
    });
    if (writeError && writeError.code !== '23505') {
      console.error('[did-you-file-24h] send log failed:', writeError.message);
    }
    emailed += 1;
  }

  return { candidates: candidates.length, emailed, skipped: null };
}
