/**
 * Incomplete-onboarding (+24h) and "did you file?" (+3 days after official-
 * form intent) drips. Idempotent via drip_email_sends. Never sends without
 * email_opt_in, a postal address, and a verified sender. Cron-only.
 */
import { commercialEmailPrereqs } from '@/lib/closing-soon-email';
import { sendDidYouFileEmail, sendIncompleteOnboardingEmail } from '@/lib/email';
import { flags } from '@/lib/flags';
import { guidedDeadline } from '@/lib/settlement-guides';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { isDeadlinePassed } from '@/lib/utils';

export const DRIP_KINDS = ['incomplete_onboarding', 'did_you_file'] as const;
export type DripKind = (typeof DRIP_KINDS)[number];

export const INCOMPLETE_ONBOARDING_AFTER_MS = 24 * 60 * 60 * 1000;
export const DID_YOU_FILE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

const UNFILED_DRIP_STATUSES = ['self_file'] as const;
const FILED_OR_CLOSED = new Set(['reported_filed', 'submitted', 'withdrawn', 'not_reported_filed']);

export interface IncompleteOnboardingCandidate {
  kind: 'incomplete_onboarding';
  userId: string;
  email: string;
  name: string | null;
}

export interface DidYouFileCandidate {
  kind: 'did_you_file';
  userId: string;
  email: string;
  name: string | null;
  claimId: string;
  slug: string;
  title: string;
}

export type DripCandidate = IncompleteOnboardingCandidate | DidYouFileCandidate;

export interface OnboardingDripResult {
  candidates: number;
  emailed: number;
  incompleteOnboarding: number;
  didYouFile: number;
  skipped: string | null;
}

export function isDripEligibleProfile(profile: {
  email_opt_in?: boolean | null;
  email?: string | null;
}): boolean {
  return Boolean(profile.email_opt_in && profile.email && profile.email.includes('@'));
}

export function isAtLeastMsAgo(iso: string | null | undefined, now: Date, ms: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at >= ms;
}

export function pickIncompleteOnboardingDrip(row: {
  userId: string;
  email: string;
  name?: string | null;
  onboarded?: boolean | null;
  emailOptIn?: boolean | null;
  createdAt: string;
  alreadySent: boolean;
}, now: Date): IncompleteOnboardingCandidate | null {
  if (row.alreadySent) return null;
  if (row.onboarded) return null;
  if (!isDripEligibleProfile({ email_opt_in: row.emailOptIn, email: row.email })) return null;
  if (!isAtLeastMsAgo(row.createdAt, now, INCOMPLETE_ONBOARDING_AFTER_MS)) return null;
  return {
    kind: 'incomplete_onboarding',
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
  };
}

export function pickDidYouFileDrip(row: {
  userId: string;
  email: string;
  name?: string | null;
  claimId: string;
  status: string;
  slug: string;
  title: string;
  deadline: string | null;
  lastOpenIntentAt: string | null;
  alreadySent: boolean;
}, now: Date): DidYouFileCandidate | null {
  if (row.alreadySent) return null;
  if (!UNFILED_DRIP_STATUSES.includes(row.status as (typeof UNFILED_DRIP_STATUSES)[number])) return null;
  if (FILED_OR_CLOSED.has(row.status)) return null;
  if (isDeadlinePassed(row.deadline, now)) return null;
  if (!isAtLeastMsAgo(row.lastOpenIntentAt, now, DID_YOU_FILE_AFTER_MS)) return null;
  return {
    kind: 'did_you_file',
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    claimId: row.claimId,
    slug: row.slug,
    title: row.title,
  };
}

export async function sendOnboardingDrips(opts: { now?: Date } = {}): Promise<OnboardingDripResult> {
  const empty: OnboardingDripResult = {
    candidates: 0,
    emailed: 0,
    incompleteOnboarding: 0,
    didYouFile: 0,
    skipped: null,
  };
  if (!flags.onboardingDrip()) {
    return { ...empty, skipped: 'ONBOARDING_DRIP_ENABLED is off' };
  }
  const gate = commercialEmailPrereqs();
  if (!gate.ok) {
    return { ...empty, skipped: gate.reason };
  }
  if (!isSupabaseConfigured()) {
    return { ...empty, skipped: 'supabase is not configured' };
  }

  const now = opts.now ?? new Date();
  const supabase = createServiceClient();
  const incompleteCutoff = new Date(now.getTime() - INCOMPLETE_ONBOARDING_AFTER_MS).toISOString();

  const [{ data: incompleteProfiles, error: incompleteError }, { data: claimData, error: claimError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, email_opt_in, onboarded, created_at')
        .eq('onboarded', false)
        .eq('email_opt_in', true)
        .lte('created_at', incompleteCutoff),
      supabase.from('claims').select('id, user_id, status, lawsuit_id, created_at').eq('status', 'self_file'),
    ]);
  if (incompleteError) {
    throw new Error(`[onboarding-drip] loading incomplete profiles failed: ${incompleteError.message}`);
  }
  if (claimError) {
    throw new Error(`[onboarding-drip] loading claims failed: ${claimError.message}`);
  }

  const profiles = ((incompleteProfiles ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    email_opt_in: boolean;
    onboarded: boolean;
    created_at: string;
  }>).filter(isDripEligibleProfile);

  const claims = (claimData ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    lawsuit_id: string | null;
    created_at: string;
  }>;

  const claimUserIds = Array.from(new Set(claims.map((c) => c.user_id)));
  const lawsuitIds = Array.from(
    new Set(claims.map((c) => c.lawsuit_id).filter((id): id is string => Boolean(id))),
  );

  const [{ data: claimProfiles, error: claimProfileError }, { data: lawsuitData, error: lawsuitError }] =
    claimUserIds.length === 0 || lawsuitIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
          supabase
            .from('profiles')
            .select('id, email, full_name, email_opt_in')
            .in('id', claimUserIds)
            .eq('email_opt_in', true),
          supabase.from('lawsuits').select('id, slug, title, deadline').in('id', lawsuitIds),
        ]);
  if (claimProfileError) {
    throw new Error(`[onboarding-drip] loading claim profiles failed: ${claimProfileError.message}`);
  }
  if (lawsuitError) {
    throw new Error(`[onboarding-drip] loading settlements failed: ${lawsuitError.message}`);
  }

  const claimProfileMap = new Map(
    ((claimProfiles ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      email_opt_in: boolean;
    }>)
      .filter(isDripEligibleProfile)
      .map((row) => [row.id, row]),
  );
  const lawsuits = new Map(
    ((lawsuitData ?? []) as Array<{ id: string; slug: string; title: string; deadline: string | null }>).map(
      (row) => [row.id, row],
    ),
  );

  const userIdsForSends = Array.from(
    new Set([...profiles.map((p) => p.id), ...claims.map((c) => c.user_id)]),
  );
  const sent = await loadSentDrips(supabase, userIdsForSends);
  const openIntentByClaim = await loadOpenFormIntent(supabase, claims);

  const candidates: DripCandidate[] = [];
  for (const profile of profiles) {
    if (!profile.email) continue;
    const picked = pickIncompleteOnboardingDrip(
      {
        userId: profile.id,
        email: profile.email,
        name: profile.full_name,
        onboarded: profile.onboarded,
        emailOptIn: profile.email_opt_in,
        createdAt: profile.created_at,
        alreadySent: sent.incomplete.has(profile.id),
      },
      now,
    );
    if (picked) candidates.push(picked);
  }

  for (const claim of claims) {
    if (!claim.lawsuit_id) continue;
    const profile = claimProfileMap.get(claim.user_id);
    const lawsuit = lawsuits.get(claim.lawsuit_id);
    if (!profile?.email || !lawsuit) continue;
    const lastOpenIntentAt = openIntentByClaim.get(claim.id) ?? claim.created_at;
    const picked = pickDidYouFileDrip(
      {
        userId: claim.user_id,
        email: profile.email,
        name: profile.full_name,
        claimId: claim.id,
        status: claim.status,
        slug: lawsuit.slug,
        title: lawsuit.title,
        // A guided settlement's official deadline, as the claim screen shows it.
        deadline: guidedDeadline(lawsuit),
        lastOpenIntentAt,
        alreadySent: sent.didYouFile.has(claim.id),
      },
      now,
    );
    if (picked) candidates.push(picked);
  }

  let emailed = 0;
  let incompleteOnboarding = 0;
  let didYouFile = 0;
  for (const candidate of candidates) {
    const sentOk =
      candidate.kind === 'incomplete_onboarding'
        ? await sendIncompleteOnboardingEmail(candidate.email, {
            name: candidate.name ?? undefined,
            to: candidate.email,
          })
        : await sendDidYouFileEmail(candidate.email, {
            name: candidate.name ?? undefined,
            title: candidate.title,
            slug: candidate.slug,
            to: candidate.email,
          });
    if (!sentOk) continue;
    const insert =
      candidate.kind === 'incomplete_onboarding'
        ? { user_id: candidate.userId, kind: candidate.kind, claim_id: null }
        : { user_id: candidate.userId, kind: candidate.kind, claim_id: candidate.claimId };
    const { error: writeError } = await supabase.from('drip_email_sends').insert(insert);
    if (writeError && writeError.code !== '23505') {
      console.error('[onboarding-drip] send log failed:', writeError.message);
    }
    emailed += 1;
    if (candidate.kind === 'incomplete_onboarding') incompleteOnboarding += 1;
    else didYouFile += 1;
  }

  return {
    candidates: candidates.length,
    emailed,
    incompleteOnboarding,
    didYouFile,
    skipped: null,
  };
}

async function loadSentDrips(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<{ incomplete: Set<string>; didYouFile: Set<string> }> {
  const incomplete = new Set<string>();
  const didYouFile = new Set<string>();
  if (userIds.length === 0) return { incomplete, didYouFile };
  const { data, error } = await supabase
    .from('drip_email_sends')
    .select('user_id, kind, claim_id')
    .in('user_id', userIds);
  if (error) {
    throw new Error(`[onboarding-drip] loading send log failed: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{ user_id: string; kind: DripKind; claim_id: string | null }>) {
    if (row.kind === 'incomplete_onboarding') incomplete.add(row.user_id);
    if (row.kind === 'did_you_file' && row.claim_id) didYouFile.add(row.claim_id);
  }
  return { incomplete, didYouFile };
}

async function loadOpenFormIntent(
  supabase: ReturnType<typeof createServiceClient>,
  claims: Array<{ id: string; user_id: string; lawsuit_id: string | null }>,
): Promise<Map<string, string>> {
  const byClaim = new Map<string, string>();
  const lawsuitIds = Array.from(
    new Set(claims.map((c) => c.lawsuit_id).filter((id): id is string => Boolean(id))),
  );
  const userIds = Array.from(new Set(claims.map((c) => c.user_id)));
  if (lawsuitIds.length === 0 || userIds.length === 0) return byClaim;

  const { data, error } = await supabase
    .from('match_events')
    .select('user_id, lawsuit_id, created_at')
    .eq('event_type', 'open_form')
    .in('user_id', userIds)
    .in('lawsuit_id', lawsuitIds);
  if (error) {
    throw new Error(`[onboarding-drip] loading open-form events failed: ${error.message}`);
  }

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ user_id: string; lawsuit_id: string; created_at: string }>) {
    const key = `${row.user_id}:${row.lawsuit_id}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(row.created_at) > Date.parse(prev)) latest.set(key, row.created_at);
  }
  for (const claim of claims) {
    if (!claim.lawsuit_id) continue;
    const at = latest.get(`${claim.user_id}:${claim.lawsuit_id}`);
    if (at) byClaim.set(claim.id, at);
  }
  return byClaim;
}
