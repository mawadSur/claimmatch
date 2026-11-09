/**
 * 7-day and 1-day claim deadline reminders for signed-in users who opted in
 * to email. Idempotent via claim_reminder_sends. Never sends without
 * email_opt_in. Cron-only.
 */
import { flags } from '@/lib/flags';
import { daysUntilDeadline } from '@/lib/claim-deadlines';
import { sendDeadlineReminderEmail } from '@/lib/email';
import { guidedDeadline } from '@/lib/settlement-guides';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const DEADLINE_REMINDER_KINDS = ['7d', '1d'] as const;
export type DeadlineReminderKind = (typeof DEADLINE_REMINDER_KINDS)[number];

export const DEADLINE_REMINDER_DAYS: Record<DeadlineReminderKind, number> = {
  '7d': 7,
  '1d': 1,
};

/** Claim statuses that mean the person has not reported filing yet. */
export const UNFILED_REMINDER_STATUSES = ['self_file', 'not_reported_filed'] as const;

export interface DeadlineReminderCandidate {
  claimId: string;
  userId: string;
  email: string;
  name: string | null;
  lawsuitId: string;
  slug: string;
  title: string;
  deadline: string;
  kind: DeadlineReminderKind;
}

export interface DeadlineReminderResult {
  candidates: number;
  emailed: number;
  skipped: string | null;
}

export function reminderKindForDays(days: number | null): DeadlineReminderKind | null {
  if (days === 7) return '7d';
  if (days === 1) return '1d';
  return null;
}

export function isReminderEligibleProfile(profile: {
  email_opt_in?: boolean | null;
  email?: string | null;
}): boolean {
  return Boolean(profile.email_opt_in && profile.email && profile.email.includes('@'));
}

export function pickDeadlineReminder(
  row: {
    claimId: string;
    userId: string;
    email: string;
    name?: string | null;
    lawsuitId: string;
    slug: string;
    title: string;
    deadline: string | null;
    alreadySent: ReadonlySet<DeadlineReminderKind>;
  },
  now: Date,
): DeadlineReminderCandidate | null {
  const kind = reminderKindForDays(daysUntilDeadline(row.deadline, now));
  if (!kind || !row.deadline) return null;
  if (row.alreadySent.has(kind)) return null;
  return {
    claimId: row.claimId,
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    lawsuitId: row.lawsuitId,
    slug: row.slug,
    title: row.title,
    deadline: row.deadline,
    kind,
  };
}

export async function sendDeadlineReminders(opts: { now?: Date } = {}): Promise<DeadlineReminderResult> {
  if (!flags.deadlineReminders()) {
    return { candidates: 0, emailed: 0, skipped: 'DEADLINE_REMINDERS_ENABLED is off' };
  }
  if (!isSupabaseConfigured()) {
    return { candidates: 0, emailed: 0, skipped: 'supabase is not configured' };
  }

  const now = opts.now ?? new Date();
  const supabase = createServiceClient();

  const { data: claimData, error: claimError } = await supabase
    .from('claims')
    .select('id, user_id, status, lawsuit_id')
    .in('status', [...UNFILED_REMINDER_STATUSES]);
  if (claimError) {
    throw new Error(`[deadline-reminders] loading claims failed: ${claimError.message}`);
  }

  const claims = (claimData ?? []) as Array<{
    id: string;
    user_id: string;
    status: string;
    lawsuit_id: string | null;
  }>;
  const lawsuitIds = Array.from(new Set(claims.map((c) => c.lawsuit_id).filter((id): id is string => Boolean(id))));
  const userIds = Array.from(new Set(claims.map((c) => c.user_id)));
  if (lawsuitIds.length === 0 || userIds.length === 0) {
    return { candidates: 0, emailed: 0, skipped: null };
  }

  const [{ data: lawsuitData, error: lawsuitError }, { data: profileData, error: profileError }] =
    await Promise.all([
      supabase.from('lawsuits').select('id, slug, title, deadline').in('id', lawsuitIds),
      supabase.from('profiles').select('id, email, full_name, email_opt_in').in('id', userIds).eq('email_opt_in', true),
    ]);
  if (lawsuitError) {
    throw new Error(`[deadline-reminders] loading settlements failed: ${lawsuitError.message}`);
  }
  if (profileError) {
    throw new Error(`[deadline-reminders] loading profiles failed: ${profileError.message}`);
  }

  const lawsuits = new Map(
    ((lawsuitData ?? []) as Array<{ id: string; slug: string; title: string; deadline: string | null }>).map(
      (row) => [row.id, row],
    ),
  );
  const profiles = new Map(
    ((profileData ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      email_opt_in: boolean;
    }>)
      .filter(isReminderEligibleProfile)
      .map((row) => [row.id, row]),
  );

  const claimIds = claims.map((c) => c.id);
  const sentByClaim = await loadSentKinds(supabase, claimIds);

  const candidates: DeadlineReminderCandidate[] = [];
  for (const claim of claims) {
    if (!claim.lawsuit_id) continue;
    const profile = profiles.get(claim.user_id);
    const lawsuit = lawsuits.get(claim.lawsuit_id);
    if (!profile || !lawsuit || !profile.email) continue;
    const picked = pickDeadlineReminder(
      {
        claimId: claim.id,
        userId: claim.user_id,
        email: profile.email,
        name: profile.full_name,
        lawsuitId: lawsuit.id,
        slug: lawsuit.slug,
        title: lawsuit.title,
        // A guided settlement's official deadline, as the claim screen shows it.
        deadline: guidedDeadline(lawsuit),
        alreadySent: sentByClaim.get(claim.id) ?? new Set(),
      },
      now,
    );
    if (picked) candidates.push(picked);
  }

  let emailed = 0;
  for (const candidate of candidates) {
    const sent = await sendDeadlineReminderEmail(candidate.email, {
      name: candidate.name ?? undefined,
      title: candidate.title,
      slug: candidate.slug,
      deadline: candidate.deadline,
      kind: candidate.kind,
      to: candidate.email,
    });
    if (!sent) continue;
    const { error: writeError } = await supabase.from('claim_reminder_sends').insert({
      user_id: candidate.userId,
      claim_id: candidate.claimId,
      lawsuit_id: candidate.lawsuitId,
      kind: candidate.kind,
    });
    if (writeError) {
      // Unique violation means a concurrent run already recorded this send.
      if (writeError.code !== '23505') {
        console.error('[deadline-reminders] send log failed:', writeError.message);
      }
    }
    emailed += 1;
  }

  return { candidates: candidates.length, emailed, skipped: null };
}

async function loadSentKinds(
  supabase: ReturnType<typeof createServiceClient>,
  claimIds: string[],
): Promise<Map<string, Set<DeadlineReminderKind>>> {
  const map = new Map<string, Set<DeadlineReminderKind>>();
  if (claimIds.length === 0) return map;
  const { data, error } = await supabase
    .from('claim_reminder_sends')
    .select('claim_id, kind')
    .in('claim_id', claimIds);
  if (error) {
    throw new Error(`[deadline-reminders] loading send log failed: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{ claim_id: string; kind: DeadlineReminderKind }>) {
    const set = map.get(row.claim_id) ?? new Set<DeadlineReminderKind>();
    set.add(row.kind);
    map.set(row.claim_id, set);
  }
  return map;
}
