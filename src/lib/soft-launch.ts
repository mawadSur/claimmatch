/**
 * Soft-launch cohort tags come from a share-link campaign that starts with
 * "soft-" (soft-1, soft-2). Counts on /admin exclude internal testers.
 */

import { createServiceClient } from '@/lib/supabase/server';

export const SOFT_LAUNCH_PREFIX = 'soft-';

export function cohortFromCampaign(campaign: string | null | undefined): string | null {
  if (typeof campaign !== 'string') return null;
  const cleaned = campaign.trim().toLowerCase();
  if (!cleaned.startsWith(SOFT_LAUNCH_PREFIX)) return null;
  if (cleaned.length <= SOFT_LAUNCH_PREFIX.length) return null;
  if (!/^[a-z0-9._:-]+$/.test(cleaned)) return null;
  return cleaned;
}

export function isSoftLaunchCohort(cohort: string | null | undefined): boolean {
  return cohortFromCampaign(cohort) !== null;
}

export interface SoftLaunchCounts {
  signups: number;
  onboarded: number;
  officialFormClicks: number;
  filingsReported: number;
}

export const EMPTY_SOFT_LAUNCH_COUNTS: SoftLaunchCounts = {
  signups: 0,
  onboarded: 0,
  officialFormClicks: 0,
  filingsReported: 0,
};

/**
 * Gate 0 bars from the soft-launch / growth plan: the soft-invite cohort
 * should reach these before outreach. Read-only; never invent progress.
 * Signups 20 is the bottom of the 20–50 invite; onboarded 50% is the
 * completion bar; 10 official-form clicks and 5 filings reported are the
 * live-claim readout.
 */
export const GATE_0_THRESHOLDS = {
  signups: 20,
  onboardedPercent: 50,
  officialFormClicks: 10,
  filingsReported: 5,
} as const;

export interface Gate0Metric {
  current: number;
  target: number;
  met: boolean;
}

export interface Gate0Progress {
  signups: Gate0Metric;
  onboardedPercent: Gate0Metric;
  officialFormClicks: Gate0Metric;
  filingsReported: Gate0Metric;
  allMet: boolean;
}

export function onboardedPercent(counts: SoftLaunchCounts): number {
  if (counts.signups <= 0) return 0;
  return Math.round((counts.onboarded / counts.signups) * 100);
}

export function gate0Progress(counts: SoftLaunchCounts): Gate0Progress {
  const onboarded = onboardedPercent(counts);
  const signups: Gate0Metric = {
    current: counts.signups,
    target: GATE_0_THRESHOLDS.signups,
    met: counts.signups >= GATE_0_THRESHOLDS.signups,
  };
  const onboardedPct: Gate0Metric = {
    current: onboarded,
    target: GATE_0_THRESHOLDS.onboardedPercent,
    met: onboarded >= GATE_0_THRESHOLDS.onboardedPercent,
  };
  const officialFormClicks: Gate0Metric = {
    current: counts.officialFormClicks,
    target: GATE_0_THRESHOLDS.officialFormClicks,
    met: counts.officialFormClicks >= GATE_0_THRESHOLDS.officialFormClicks,
  };
  const filingsReported: Gate0Metric = {
    current: counts.filingsReported,
    target: GATE_0_THRESHOLDS.filingsReported,
    met: counts.filingsReported >= GATE_0_THRESHOLDS.filingsReported,
  };
  return {
    signups,
    onboardedPercent: onboardedPct,
    officialFormClicks,
    filingsReported,
    allMet:
      signups.met && onboardedPct.met && officialFormClicks.met && filingsReported.met,
  };
}

export function tallySoftLaunch(rows: {
  onboarded?: boolean | null;
  is_internal?: boolean | null;
  cohort?: string | null;
  official_form_clicks?: number | null;
  filings_reported?: number | null;
}[]): SoftLaunchCounts {
  const counts = { ...EMPTY_SOFT_LAUNCH_COUNTS };
  for (const row of rows) {
    if (row.is_internal) continue;
    if (!isSoftLaunchCohort(row.cohort)) continue;
    counts.signups += 1;
    if (row.onboarded) counts.onboarded += 1;
    counts.officialFormClicks += Number(row.official_form_clicks ?? 0);
    counts.filingsReported += Number(row.filings_reported ?? 0);
  }
  return counts;
}

export async function loadSoftLaunchCounts(): Promise<SoftLaunchCounts> {
  try {
    const svc = createServiceClient();
    const { data: profiles, error } = await svc
      .from('profiles')
      .select('id, onboarded, is_internal, cohort')
      .like('cohort', 'soft-%')
      .eq('is_internal', false);
    if (error || !profiles) return { ...EMPTY_SOFT_LAUNCH_COUNTS };

    const ids = (profiles as Array<{ id: string }>).map((p) => p.id);
    let officialFormClicks = 0;
    let filingsReported = 0;
    if (ids.length > 0) {
      const [{ count: formClicks }, { count: filings }] = await Promise.all([
        svc
          .from('match_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'open_form')
          .in('user_id', ids),
        svc
          .from('claims')
          .select('*', { count: 'exact', head: true })
          .in('user_id', ids)
          .in('status', ['reported_filed', 'submitted']),
      ]);
      officialFormClicks = formClicks ?? 0;
      filingsReported = filings ?? 0;
    }

    return {
      signups: profiles.length,
      onboarded: (profiles as Array<{ onboarded?: boolean }>).filter((p) => p.onboarded).length,
      officialFormClicks,
      filingsReported,
    };
  } catch {
    return { ...EMPTY_SOFT_LAUNCH_COUNTS };
  }
}
