/**
 * Per-tester / per-community invite codes. Reuses share_links, share_link_clicks,
 * and profiles.first_ref. Identified by the beta UTM pair so regular campaign
 * links stay out of the SoftLaunch table.
 */
import { sanitizeRef } from '@/lib/attribution';
import {
  BETA_INVITE_UTM_MEDIUM,
  BETA_INVITE_UTM_SOURCE,
  isBetaInviteLink,
} from '@/lib/beta-invite-utm';
import { flags } from '@/lib/flags';
import { newShareCode, sanitizeDestination, shortShareUrl } from '@/lib/share-links';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/utils';

export {
  BETA_INVITE_UTM_CAMPAIGN,
  BETA_INVITE_UTM_MEDIUM,
  BETA_INVITE_UTM_SOURCE,
  isBetaInviteLink,
} from '@/lib/beta-invite-utm';

export interface BetaInviteCounts {
  visits: number;
  signups: number;
  profilesCompleted: number;
  matchesViewed: number;
  officialFormsOpened: number;
  filingsReported: number;
}

export const EMPTY_BETA_INVITE_COUNTS: BetaInviteCounts = {
  visits: 0,
  signups: 0,
  profilesCompleted: 0,
  matchesViewed: 0,
  officialFormsOpened: 0,
  filingsReported: 0,
};

export interface BetaInviteRecord {
  id: string;
  code: string;
  label: string | null;
  destination: string;
  created_at: string;
}

export interface BetaInviteStats extends BetaInviteRecord {
  visits: number;
  signups: number;
  profilesCompleted: number;
  matchesViewed: number;
  officialFormsOpened: number;
  filingsReported: number;
  shortUrl: string;
  inviteUrl: string;
}

export function isBetaInviteCodesEnabled(): boolean {
  return flags.betaInviteCodes();
}

/** Long invite URL: /invite?code=… so the landing can persist first-touch ref. */
export function betaInviteUrl(origin: string, code: string): string {
  const safe = sanitizeRef(code);
  const base = origin.replace(/\/$/, '');
  return `${base}/invite?code=${encodeURIComponent(safe ?? '')}`;
}

export function betaInviteDestination(): string {
  return flags.softInviteLanding() ? '/invite' : '/signup';
}

export function newBetaInviteCode(): string {
  return newShareCode();
}

export function sanitizeBetaInviteLabel(raw: unknown, max = 80): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().slice(0, max);
  return cleaned || null;
}

export function tallyBetaInvite(
  rows: Array<{
    code: string;
    visits?: number;
    signups?: number;
    onboarded?: number;
    matchViews?: number;
    formOpens?: number;
    filings?: number;
  }>,
): Map<string, BetaInviteCounts> {
  const byCode = new Map<string, BetaInviteCounts>();
  for (const row of rows) {
    byCode.set(row.code, {
      visits: Number(row.visits ?? 0),
      signups: Number(row.signups ?? 0),
      profilesCompleted: Number(row.onboarded ?? 0),
      matchesViewed: Number(row.matchViews ?? 0),
      officialFormsOpened: Number(row.formOpens ?? 0),
      filingsReported: Number(row.filings ?? 0),
    });
  }
  return byCode;
}

function withUrls(row: BetaInviteRecord, counts: BetaInviteCounts): BetaInviteStats {
  const origin = SITE.url;
  return {
    ...row,
    destination: sanitizeDestination(row.destination),
    ...counts,
    shortUrl: shortShareUrl(origin, row.code),
    inviteUrl: betaInviteUrl(origin, row.code),
  };
}

export async function loadBetaInviteStats(): Promise<BetaInviteStats[]> {
  if (!flags.betaInviteCodes()) return [];
  try {
    const svc = createServiceClient();
    const { data: links, error } = await svc
      .from('share_links')
      .select('id, code, destination, utm_source, utm_medium, utm_campaign, label, created_at')
      .eq('utm_source', BETA_INVITE_UTM_SOURCE)
      .eq('utm_medium', BETA_INVITE_UTM_MEDIUM)
      .order('created_at', { ascending: false });
    if (error || !links) return [];

    const records = (links as Array<BetaInviteRecord & { utm_source?: string | null; utm_medium?: string | null }>).filter(
      isBetaInviteLink,
    );
    const codes = records.map((r) => r.code);
    if (codes.length === 0) return [];

    const visitsByCode = new Map<string, number>();
    const signupsByCode = new Map<string, { signups: number; onboarded: number; userIds: string[] }>();

    const [{ data: clicks }, { data: signups }] = await Promise.all([
      svc.from('share_link_clicks').select('code').in('code', codes),
      svc.from('profiles').select('id, first_ref, onboarded').in('first_ref', codes),
    ]);
    for (const row of (clicks ?? []) as Array<{ code: string }>) {
      visitsByCode.set(row.code, (visitsByCode.get(row.code) ?? 0) + 1);
    }
    for (const row of (signups ?? []) as Array<{
      id: string;
      first_ref: string | null;
      onboarded?: boolean | null;
    }>) {
      if (!row.first_ref) continue;
      const current = signupsByCode.get(row.first_ref) ?? { signups: 0, onboarded: 0, userIds: [] };
      current.signups += 1;
      if (row.onboarded) current.onboarded += 1;
      current.userIds.push(row.id);
      signupsByCode.set(row.first_ref, current);
    }

    const allUserIds = [...signupsByCode.values()].flatMap((s) => s.userIds);
    const viewsByUser = new Map<string, number>();
    const formsByUser = new Map<string, number>();
    const filingsByUser = new Map<string, number>();
    if (allUserIds.length > 0) {
      const [{ data: events }, { data: claims }] = await Promise.all([
        svc.from('match_events').select('user_id, event_type').in('user_id', allUserIds),
        svc
          .from('claims')
          .select('user_id, status')
          .in('user_id', allUserIds)
          .in('status', ['reported_filed', 'submitted']),
      ]);
      const viewed = new Set<string>();
      for (const row of (events ?? []) as Array<{ user_id: string; event_type: string }>) {
        if (row.event_type === 'view' || row.event_type === 'impression') {
          viewed.add(row.user_id);
        }
        if (row.event_type === 'open_form') {
          formsByUser.set(row.user_id, (formsByUser.get(row.user_id) ?? 0) + 1);
        }
      }
      for (const userId of viewed) viewsByUser.set(userId, 1);
      for (const row of (claims ?? []) as Array<{ user_id: string }>) {
        filingsByUser.set(row.user_id, (filingsByUser.get(row.user_id) ?? 0) + 1);
      }
    }

    return records.map((row) => {
      const signup = signupsByCode.get(row.code);
      const userIds = signup?.userIds ?? [];
      let matchesViewed = 0;
      let officialFormsOpened = 0;
      let filingsReported = 0;
      for (const userId of userIds) {
        matchesViewed += viewsByUser.get(userId) ?? 0;
        officialFormsOpened += formsByUser.get(userId) ?? 0;
        filingsReported += filingsByUser.get(userId) ?? 0;
      }
      return withUrls(row, {
        visits: visitsByCode.get(row.code) ?? 0,
        signups: signup?.signups ?? 0,
        profilesCompleted: signup?.onboarded ?? 0,
        matchesViewed,
        officialFormsOpened,
        filingsReported,
      });
    });
  } catch {
    return [];
  }
}

/** Best-effort click log for /invite?code= visits ( /r/:code already inserts). */
export async function recordBetaInviteVisit(code: string): Promise<boolean> {
  const safe = sanitizeRef(code);
  if (!safe || !flags.betaInviteCodes()) return false;
  try {
    const svc = createServiceClient();
    const { data: link } = await svc
      .from('share_links')
      .select('code, utm_source, utm_medium')
      .eq('code', safe)
      .maybeSingle();
    if (!link || !isBetaInviteLink(link)) return false;
    const { error } = await svc.from('share_link_clicks').insert({ code: safe });
    return !error;
  } catch {
    return false;
  }
}
