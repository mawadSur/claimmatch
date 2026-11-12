/**
 * Load opted-in people, plan match-alert emails, optionally send.
 * Cron-only. Web push is out of scope.
 */
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureServerEvent, subscriberDistinctId } from '@/lib/analytics/server';
import { FICTIONAL_SLUGS } from '@/lib/fictional-slugs';
import {
  matchAlertEmailsEnabled,
  matchAlertSendBlocked,
  planPersonAlert,
  type MatchAlertAudience,
  type MatchAlertPerson,
  type PlannedMatchAlert,
} from '@/lib/match-alert';
import { sendMatchAlertEmail, startUrlsForClaims } from '@/lib/match-alert-email';
import {
  issueMatchAlertToken,
  matchAlertSigningSecret,
  normalizeAlertEmail,
} from '@/lib/match-alert-token';
import { factsFromRows } from '@/lib/profile-facts';
import { catalogDeadlineFilter, openGuidedCatalog } from '@/lib/settlement-guides';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { SITE } from '@/lib/utils';
import type { Lawsuit, Profile, ProfileFact } from '@/lib/types';

export interface MatchAlertJobResult {
  considered: number;
  planned: number;
  emailed: number;
  skipped: string | null;
  dryRun: boolean;
  plans: Array<{
    emailMasked: string;
    source: MatchAlertAudience;
    claimCount: number;
    slugs: string[];
    skip?: string;
  }>;
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••@${email.slice(at + 1)}`;
}

export async function sendMatchAlerts(opts: {
  dryRun?: boolean;
  now?: Date;
  /** Plan even when MATCH_ALERT_EMAILS_ENABLED is off. Never sends. */
  planWhenOff?: boolean;
} = {}): Promise<MatchAlertJobResult> {
  const now = opts.now ?? new Date();
  const dryRun = Boolean(opts.dryRun);
  const empty: MatchAlertJobResult = {
    considered: 0,
    planned: 0,
    emailed: 0,
    skipped: null,
    dryRun,
    plans: [],
  };

  if (!dryRun && !opts.planWhenOff && !matchAlertEmailsEnabled()) {
    return { ...empty, skipped: 'flag_off' };
  }
  if (!isSupabaseConfigured()) {
    return { ...empty, skipped: 'supabase_unconfigured' };
  }

  const supabase = createServiceClient();
  const { data: lawsuitData, error: lawsuitErr } = await supabase
    .from('lawsuits')
    .select('*')
    .eq('review_status', 'published')
    .in('status', ['open', 'closing_soon'])
    .or(catalogDeadlineFilter(now))
    .not('slug', 'in', `(${FICTIONAL_SLUGS.join(',')})`);
  if (lawsuitErr) {
    throw new Error(`[match-alert] loading settlements failed: ${lawsuitErr.message}`);
  }
  const lawsuits = openGuidedCatalog((lawsuitData ?? []) as Lawsuit[], now);
  if (lawsuits.length === 0) {
    return { ...empty, skipped: 'no_open_verified' };
  }

  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, state, attributes, email_opt_in')
    .eq('email_opt_in', true);
  if (profileErr) {
    throw new Error(`[match-alert] loading profiles failed: ${profileErr.message}`);
  }
  const profiles = ((profileData ?? []) as Array<
    Pick<Profile, 'id' | 'email' | 'full_name' | 'state' | 'attributes' | 'email_opt_in'>
  >).filter((row) => row.email && row.email.includes('@'));

  const optedOutEmails = new Set<string>();
  const { data: optedOut } = await supabase
    .from('profiles')
    .select('email')
    .eq('email_opt_in', false);
  for (const row of optedOut ?? []) {
    const email = (row as { email?: string | null }).email;
    if (email) optedOutEmails.add(normalizeAlertEmail(email));
  }

  const factsByUser = await loadFactsByUser(
    supabase,
    profiles.map((p) => p.id),
  );

  const { data: subscriberData, error: subErr } = await supabase
    .from('subscribers')
    .select('email, state, interests, confirmed, unsubscribed_at')
    .eq('confirmed', true)
    .is('unsubscribed_at', null);
  if (subErr) {
    throw new Error(`[match-alert] loading subscribers failed: ${subErr.message}`);
  }

  const people: MatchAlertPerson[] = [];
  const profileEmails = new Set<string>();
  for (const profile of profiles) {
    const email = normalizeAlertEmail(profile.email as string);
    profileEmails.add(email);
    people.push({
      email,
      name: profile.full_name,
      source: 'profile',
      userId: profile.id,
      state: profile.state,
      profile: {
        state: profile.state,
        attributes: profile.attributes || {},
        facts: factsByUser.get(profile.id) ?? [],
        email_opt_in: true,
      },
    });
  }
  for (const raw of subscriberData ?? []) {
    const row = raw as {
      email: string;
      state?: string | null;
      interests?: string[] | null;
      unsubscribed_at?: string | null;
    };
    const email = normalizeAlertEmail(row.email);
    if (profileEmails.has(email) || optedOutEmails.has(email)) continue;
    people.push({
      email,
      source: 'subscriber',
      state: row.state ?? null,
      interests: row.interests ?? [],
    });
  }

  if (people.length === 0) {
    return { ...empty, skipped: 'no_audience' };
  }

  const emails = people.map((p) => p.email);
  const { data: sendRows, error: sendErr } = await supabase
    .from('match_alert_sends')
    .select('email, lawsuit_id, sent_at')
    .in('email', emails);
  if (sendErr) {
    throw new Error(`[match-alert] loading send log failed: ${sendErr.message}`);
  }

  const sentByEmail = new Map<string, { ids: Set<string>; lastSentAt: string | null }>();
  for (const raw of sendRows ?? []) {
    const row = raw as { email: string; lawsuit_id: string; sent_at: string };
    const email = normalizeAlertEmail(row.email);
    const entry = sentByEmail.get(email) ?? { ids: new Set<string>(), lastSentAt: null };
    entry.ids.add(row.lawsuit_id);
    if (!entry.lastSentAt || row.sent_at > entry.lastSentAt) entry.lastSentAt = row.sent_at;
    sentByEmail.set(email, entry);
  }

  const plans: PlannedMatchAlert[] = people.map((person) => {
    const prior = sentByEmail.get(person.email);
    return planPersonAlert({
      person,
      lawsuits,
      alreadySentLawsuitIds: prior?.ids ?? new Set(),
      lastSentAt: prior?.lastSentAt ?? null,
      now,
    });
  });

  const ready = plans.filter((plan) => plan.claims.length > 0 && !plan.skip);
  const summaryPlans = plans.map((plan) => ({
    emailMasked: maskEmail(plan.email),
    source: plan.source,
    claimCount: plan.claims.length,
    slugs: plan.claims.map((c) => c.slug),
    skip: plan.skip,
  }));

  if (dryRun || (opts.planWhenOff && !matchAlertEmailsEnabled())) {
    return {
      considered: people.length,
      planned: ready.length,
      emailed: 0,
      skipped: matchAlertEmailsEnabled() ? null : 'flag_off',
      dryRun: true,
      plans: summaryPlans,
    };
  }

  const sendBlock = matchAlertSendBlocked();
  if (sendBlock.blocked) {
    return {
      considered: people.length,
      planned: ready.length,
      emailed: 0,
      skipped: sendBlock.reason,
      dryRun: false,
      plans: summaryPlans,
    };
  }

  const secret = matchAlertSigningSecret();
  if (!secret) {
    return {
      considered: people.length,
      planned: ready.length,
      emailed: 0,
      skipped: 'missing_signing_secret',
      dryRun: false,
      plans: summaryPlans,
    };
  }

  let emailed = 0;
  for (const plan of ready) {
    const issued = plan.claims.map((claim) =>
      issueMatchAlertToken({ email: plan.email, lawsuitId: claim.lawsuitId, now, secret }),
    );
    const sent = await sendMatchAlertEmail({
      to: plan.email,
      name: plan.name,
      claims: startUrlsForClaims(
        plan.claims,
        issued.map((row) => row.token),
        SITE.url,
      ),
    });
    if (!sent) continue;

    const sendInserts = plan.claims.map((claim) => ({
      email: plan.email,
      user_id: plan.userId ?? null,
      lawsuit_id: claim.lawsuitId,
      source: plan.source,
      sent_at: now.toISOString(),
    }));
    const { data: stored, error: insertErr } = await supabase
      .from('match_alert_sends')
      .insert(sendInserts)
      .select('id, lawsuit_id');
    if (insertErr) {
      console.error('[match-alert] send log insert failed');
      continue;
    }
    const sendIdByLawsuit = new Map(
      ((stored ?? []) as Array<{ id: string; lawsuit_id: string }>).map((row) => [
        row.lawsuit_id,
        row.id,
      ]),
    );
    const tokenRows = issued.map((row, i) => ({
      token_hash: row.tokenHash,
      email: plan.email,
      lawsuit_id: plan.claims[i].lawsuitId,
      send_id: sendIdByLawsuit.get(plan.claims[i].lawsuitId) ?? null,
      expires_at: row.expiresAt.toISOString(),
    }));
    const { error: tokenErr } = await supabase.from('match_alert_tokens').insert(tokenRows);
    if (tokenErr) {
      console.error('[match-alert] token insert failed');
    }
    emailed += 1;
    await captureServerEvent({
      event: ANALYTICS_EVENTS.match_alert_sent,
      distinctId: plan.userId || subscriberDistinctId(plan.email),
      properties: {
        claim_count: plan.claims.length,
        source: plan.source,
      },
    });
  }

  return {
    considered: people.length,
    planned: ready.length,
    emailed,
    skipped: null,
    dryRun: false,
    plans: summaryPlans,
  };
}

async function loadFactsByUser(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Map<string, ProfileFact[]>> {
  const facts = new Map<string, ProfileFact[]>();
  if (userIds.length === 0) return facts;
  const { data } = await supabase
    .from('profile_facts')
    .select('user_id, type, value, start_date, end_date, source')
    .in('user_id', userIds);
  const grouped = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const userId = (row as { user_id: string }).user_id;
    const list = grouped.get(userId) ?? [];
    list.push(row);
    grouped.set(userId, list);
  }
  for (const [userId, rows] of grouped) {
    facts.set(userId, factsFromRows(rows ?? []));
  }
  return facts;
}
