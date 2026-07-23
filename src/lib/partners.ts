import { createClient } from '@/lib/supabase/server';
import type { Partner } from './types';
import { SAMPLE_PARTNERS } from './sample-partners';
import { rankPartnersForContext } from './partners-core';

/**
 * Data access for partner services (the referral-revenue catalog). Every read
 * degrades gracefully to SAMPLE_PARTNERS when Supabase is not configured,
 * mirroring `@/lib/lawsuits`. Pure revenue/formatting helpers live in
 * `./partners-core` (re-exported below) so client + test code can use them
 * without pulling in the server-only Supabase client.
 */

export {
  DEFAULT_PARTNER_DISCLOSURE,
  centsToUSD,
  CATEGORY_AFFINITY,
  rankPartnersForContext,
  leadRevenueAtClick,
  leadStatusAtClick,
  summarizeLeadEvents,
  type LeadSummary,
} from './partners-core';

function supabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getActivePartners(): Promise<Partner[]> {
  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('active', true)
        .order('priority', { ascending: false });
      // A configured DB is authoritative — return its rows even when empty.
      if (!error && data) return data as Partner[];
    } catch {
      // fall through to sample partners
    }
  }
  return SAMPLE_PARTNERS.filter((p) => p.active);
}

export async function getPartnerBySlug(slug: string): Promise<Partner | null> {
  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('partners')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (data) return data as Partner;
    } catch {
      // fall through
    }
  }
  return SAMPLE_PARTNERS.find((p) => p.slug === slug) ?? null;
}

/**
 * Pick the partners to show for a placement. Loads the active catalog, then
 * ranks it for the given settlement context (pure logic in partners-core).
 */
export async function pickPartnersForContext(opts: {
  lawsuitCategory?: string | null;
  limit?: number;
}): Promise<Partner[]> {
  const partners = await getActivePartners();
  return rankPartnersForContext(partners, opts);
}
