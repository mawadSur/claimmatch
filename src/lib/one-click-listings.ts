/**
 * Public catalog: which published settlements currently have an approved
 * filing spec and an approved one-click (agent) filing policy with an enabled
 * channel. Used for the Easy submit badge and filter. Server only.
 *
 * Reads filing_specs / filing_policies with the service role when it is
 * configured; otherwise the anon client. Any failure returns an empty set so
 * the catalog still renders. Kill-switched settlements are left out. Draft
 * spec/policy rows never qualify.
 */
import { serviceRoleConfigured } from '@/lib/claims-server';
import { flags } from '@/lib/flags';
import { createPublicClient, createServiceClient } from '@/lib/supabase/server';

type PolicyRow = {
  lawsuit_id: string | null;
  channels: unknown;
};

type ControlRow = {
  lawsuit_id: string | null;
};

function enabledChannel(channels: unknown): boolean {
  return Array.isArray(channels) && channels.some((c) => c && typeof c === 'object' && (c as { enabled?: unknown }).enabled === true);
}

export async function oneClickLawsuitIdSet(): Promise<Set<string>> {
  if (!flags.oneClickFiling()) return new Set();
  try {
    const db = serviceRoleConfigured() ? createServiceClient() : createPublicClient();
    const [{ data: policies, error: policyErr }, { data: specs, error: specErr }, { data: killed, error: killErr }] =
      await Promise.all([
        db
          .from('filing_policies')
          .select('lawsuit_id, channels')
          .eq('status', 'approved')
          .eq('agent_filing', 'allowed')
          .not('lawsuit_id', 'is', null),
        db.from('filing_specs').select('lawsuit_id').eq('status', 'approved').not('lawsuit_id', 'is', null),
        db.from('filing_controls').select('lawsuit_id').eq('kill_switch', true).not('lawsuit_id', 'is', null),
      ]);
    if (policyErr || specErr) return new Set();
    const specIds = new Set(
      ((specs ?? []) as { lawsuit_id: string | null }[])
        .map((r) => (r.lawsuit_id ? String(r.lawsuit_id) : ''))
        .filter(Boolean),
    );
    const killedIds = new Set(
      killErr ? [] : ((killed ?? []) as ControlRow[]).map((r) => String(r.lawsuit_id)).filter(Boolean),
    );
    return new Set(
      ((policies ?? []) as PolicyRow[])
        .filter(
          (r) =>
            r.lawsuit_id &&
            specIds.has(String(r.lawsuit_id)) &&
            enabledChannel(r.channels) &&
            !killedIds.has(String(r.lawsuit_id)),
        )
        .map((r) => String(r.lawsuit_id)),
    );
  } catch {
    return new Set();
  }
}
