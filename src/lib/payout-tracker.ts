/**
 * Payout-tracker emails for users who reported filing and opted in.
 * One email when the listed final-approval hearing date has passed, and one
 * when admin-entered payment timing is on the settlement. Idempotent via
 * payout_tracker_sends. Never mentions a fee. Cron-only.
 */
import { isUserReportedSubmitted } from '@/lib/claim-timeline';
import { daysUntilDeadline } from '@/lib/claim-deadlines';
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { sendPayoutTrackerEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const PAYOUT_TRACKER_KINDS = ['hearing_passed', 'payment_timing'] as const;
export type PayoutTrackerKind = (typeof PAYOUT_TRACKER_KINDS)[number];

export const FILED_TRACKER_STATUSES = ['reported_filed', 'submitted'] as const;

export interface PayoutTrackerCandidate {
  claimId: string;
  userId: string;
  email: string;
  name: string | null;
  lawsuitId: string;
  slug: string;
  title: string;
  kind: PayoutTrackerKind;
  fingerprint: string;
  hearingAt: string | null;
  paymentTimingText: string | null;
}

export interface PayoutTrackerResult {
  candidates: number;
  emailed: number;
  skipped: string | null;
}

export function isTrackerEligibleProfile(profile: {
  email_opt_in?: boolean | null;
  email?: string | null;
}): boolean {
  return Boolean(profile.email_opt_in && profile.email && profile.email.includes('@'));
}

export function paymentTimingFingerprint(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  return text.trim();
}

/** Hearing has passed when the listed date is today or earlier (US Eastern days). */
export function hearingHasPassed(hearingAt: string | null | undefined, now: Date): boolean {
  const days = daysUntilDeadline(hearingAt, now);
  return days !== null && days <= 0;
}

export function pickPayoutTrackerSends(
  row: {
    claimId: string;
    userId: string;
    email: string;
    name?: string | null;
    lawsuitId: string;
    slug: string;
    title: string;
    hearingAt: string | null;
    paymentTimingText: string | null;
    alreadySent: ReadonlySet<string>;
  },
  now: Date,
): PayoutTrackerCandidate[] {
  if (!isTrackerEligibleProfile({ email_opt_in: true, email: row.email })) return [];

  const out: PayoutTrackerCandidate[] = [];
  const base = {
    claimId: row.claimId,
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    lawsuitId: row.lawsuitId,
    slug: row.slug,
    title: row.title,
  };

  if (row.hearingAt && hearingHasPassed(row.hearingAt, now)) {
    const fingerprint = '';
    const key = sendKey('hearing_passed', fingerprint);
    if (!row.alreadySent.has(key)) {
      out.push({
        ...base,
        kind: 'hearing_passed',
        fingerprint,
        hearingAt: row.hearingAt,
        paymentTimingText: null,
      });
    }
  }

  const timing = paymentTimingFingerprint(row.paymentTimingText);
  if (timing) {
    const key = sendKey('payment_timing', timing);
    if (!row.alreadySent.has(key)) {
      out.push({
        ...base,
        kind: 'payment_timing',
        fingerprint: timing,
        hearingAt: null,
        paymentTimingText: timing,
      });
    }
  }

  return out;
}

export function sendKey(kind: PayoutTrackerKind, fingerprint: string): string {
  return `${kind}:${fingerprint}`;
}

export async function sendPayoutTrackerEmails(opts: { now?: Date } = {}): Promise<PayoutTrackerResult> {
  if (!flags.payoutTrackerEmails()) {
    return { candidates: 0, emailed: 0, skipped: 'PAYOUT_TRACKER_EMAILS_ENABLED is off' };
  }
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    return { candidates: 0, emailed: 0, skipped: gate.reason };
  }
  if (!isSupabaseConfigured()) {
    return { candidates: 0, emailed: 0, skipped: 'supabase is not configured' };
  }

  const now = opts.now ?? new Date();
  const supabase = createServiceClient();

  const { data: claimData, error: claimError } = await supabase
    .from('claims')
    .select('id, user_id, status, lawsuit_id, confirmation_number')
    .in('status', [...FILED_TRACKER_STATUSES]);
  if (claimError) {
    throw new Error(`[payout-tracker] loading claims failed: ${claimError.message}`);
  }

  const claims = ((claimData ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    lawsuit_id: string | null;
    confirmation_number: string | null;
  }>).filter(isUserReportedSubmitted);
  const lawsuitIds = Array.from(new Set(claims.map((c) => c.lawsuit_id).filter((id): id is string => Boolean(id))));
  const userIds = Array.from(new Set(claims.map((c) => c.user_id)));
  if (lawsuitIds.length === 0 || userIds.length === 0) {
    return { candidates: 0, emailed: 0, skipped: null };
  }

  const [{ data: lawsuitData, error: lawsuitError }, { data: profileData, error: profileError }] =
    await Promise.all([
      supabase
        .from('lawsuits')
        .select('id, slug, title, final_approval_hearing_at, payment_timing_text')
        .in('id', lawsuitIds),
      supabase.from('profiles').select('id, email, full_name, email_opt_in').in('id', userIds).eq('email_opt_in', true),
    ]);
  if (lawsuitError) {
    throw new Error(`[payout-tracker] loading settlements failed: ${lawsuitError.message}`);
  }
  if (profileError) {
    throw new Error(`[payout-tracker] loading profiles failed: ${profileError.message}`);
  }

  const lawsuits = new Map(
    (
      (lawsuitData ?? []) as Array<{
        id: string;
        slug: string;
        title: string;
        final_approval_hearing_at: string | null;
        payment_timing_text: string | null;
      }>
    ).map((row) => [row.id, row]),
  );
  const profiles = new Map(
    ((profileData ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      email_opt_in: boolean;
    }>)
      .filter(isTrackerEligibleProfile)
      .map((row) => [row.id, row]),
  );

  const sentByClaim = await loadSentKeys(
    supabase,
    claims.map((c) => c.id),
  );

  const candidates: PayoutTrackerCandidate[] = [];
  for (const claim of claims) {
    if (!claim.lawsuit_id) continue;
    const profile = profiles.get(claim.user_id);
    const lawsuit = lawsuits.get(claim.lawsuit_id);
    if (!profile || !lawsuit || !profile.email) continue;
    candidates.push(
      ...pickPayoutTrackerSends(
        {
          claimId: claim.id,
          userId: claim.user_id,
          email: profile.email,
          name: profile.full_name,
          lawsuitId: lawsuit.id,
          slug: lawsuit.slug,
          title: lawsuit.title,
          hearingAt: lawsuit.final_approval_hearing_at,
          paymentTimingText: lawsuit.payment_timing_text,
          alreadySent: sentByClaim.get(claim.id) ?? new Set(),
        },
        now,
      ),
    );
  }

  let emailed = 0;
  for (const candidate of candidates) {
    const sent = await sendPayoutTrackerEmail(candidate.email, {
      name: candidate.name ?? undefined,
      title: candidate.title,
      slug: candidate.slug,
      kind: candidate.kind,
      hearingAt: candidate.hearingAt,
      paymentTimingText: candidate.paymentTimingText,
      to: candidate.email,
    });
    if (!sent) continue;
    const { error: writeError } = await supabase.from('payout_tracker_sends').insert({
      user_id: candidate.userId,
      claim_id: candidate.claimId,
      lawsuit_id: candidate.lawsuitId,
      kind: candidate.kind,
      fingerprint: candidate.fingerprint,
    });
    if (writeError) {
      if (writeError.code !== '23505') {
        console.error('[payout-tracker] send log failed:', writeError.message);
      }
    }
    emailed += 1;
  }

  return { candidates: candidates.length, emailed, skipped: null };
}

async function loadSentKeys(
  supabase: ReturnType<typeof createServiceClient>,
  claimIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (claimIds.length === 0) return map;
  const { data, error } = await supabase
    .from('payout_tracker_sends')
    .select('claim_id, kind, fingerprint')
    .in('claim_id', claimIds);
  if (error) {
    throw new Error(`[payout-tracker] loading send log failed: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{
    claim_id: string;
    kind: PayoutTrackerKind;
    fingerprint: string | null;
  }>) {
    const set = map.get(row.claim_id) ?? new Set<string>();
    set.add(sendKey(row.kind, row.fingerprint ?? ''));
    map.set(row.claim_id, set);
  }
  return map;
}
