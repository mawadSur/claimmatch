/**
 * Cron-only official-site probes for held closures. Never import this from a
 * client component — it uses the service-role client.
 */
import { flags } from '@/lib/flags';
import {
  HELD_SITE_CHECK_BUDGET_MS,
  HELD_SITE_CHECK_GAP_MS,
  HELD_SITE_CHECK_MAX_PER_RUN,
  needsHeldSiteCheck,
  probeHeldOfficialUrl,
  type HeldSiteCheck,
} from '@/lib/held-closure-triage';
import { createServiceClient } from '@/lib/supabase/server';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HeldCheckTarget = {
  slug: string;
  officialHref: string | null;
  checked_at: string | null;
};

/**
 * Probe official URLs for current held slugs. Cron-only. Rate-limited and
 * time-boxed. Persists classification only — never the page body.
 */
export async function runHeldClosureSiteChecks(opts: {
  fetchFn?: typeof fetch;
  now?: Date;
  targets?: HeldCheckTarget[];
} = {}): Promise<{ checked: number; skipped: string | null }> {
  if (!flags.heldClosureTriage()) {
    return { checked: 0, skipped: 'HELD_CLOSURE_TRIAGE_ENABLED is off' };
  }

  const now = opts.now ?? new Date();
  const svc = createServiceClient();
  const targets = opts.targets ?? (await loadHeldCheckTargets(svc));
  const due = targets.filter((row) => needsHeldSiteCheck(row, now)).slice(0, HELD_SITE_CHECK_MAX_PER_RUN);

  const started = Date.now();
  let checked = 0;
  for (const row of due) {
    if (Date.now() - started > HELD_SITE_CHECK_BUDGET_MS) break;
    if (!row.officialHref) {
      await upsertHeldSiteCheck(svc, {
        slug: row.slug,
        http_status: null,
        signal: 'unknown',
        checked_at: now.toISOString(),
      });
      checked += 1;
      continue;
    }
    const result = await probeHeldOfficialUrl(row.officialHref, opts.fetchFn ?? fetch);
    await upsertHeldSiteCheck(svc, {
      slug: row.slug,
      http_status: result.http_status,
      signal: result.signal,
      checked_at: now.toISOString(),
    });
    checked += 1;
    if (checked < due.length) await sleep(HELD_SITE_CHECK_GAP_MS);
  }
  return { checked, skipped: null };
}

async function loadHeldCheckTargets(
  svc: ReturnType<typeof createServiceClient>,
): Promise<HeldCheckTarget[]> {
  const { loadHeldClosureCandidates } = await import('@/lib/held-closures');
  const items = await loadHeldClosureCandidates(svc);
  const slugs = items.map((item) => item.slug);
  const checks = await loadHeldSiteChecks(svc, slugs);
  return items.map((item) => ({
    slug: item.slug,
    officialHref: item.officialHref,
    checked_at: checks.get(item.slug)?.checked_at ?? null,
  }));
}

async function upsertHeldSiteCheck(
  svc: ReturnType<typeof createServiceClient>,
  row: HeldSiteCheck,
): Promise<void> {
  const { error } = await svc.from('held_closure_site_checks').upsert(
    {
      slug: row.slug,
      http_status: row.http_status,
      signal: row.signal,
      checked_at: row.checked_at,
    },
    { onConflict: 'slug' },
  );
  if (error) console.error('[held-triage] site check write failed:', error.message);
}

export async function loadHeldSiteChecks(
  svc: ReturnType<typeof createServiceClient>,
  slugs: string[],
): Promise<Map<string, HeldSiteCheck>> {
  const map = new Map<string, HeldSiteCheck>();
  if (slugs.length === 0) return map;
  const { data, error } = await svc
    .from('held_closure_site_checks')
    .select('slug, http_status, signal, checked_at')
    .in('slug', slugs);
  if (error) {
    console.error('[held-triage] site checks list failed:', error.message);
    return map;
  }
  for (const row of (data ?? []) as HeldSiteCheck[]) {
    map.set(row.slug, row);
  }
  return map;
}
