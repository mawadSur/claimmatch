import { createClient } from '@/lib/supabase/server';
import type { Lawsuit, LawsuitStatus } from './types';
import { SAMPLE_LAWSUITS } from './sample-data';
import { todayISO, daysUntil } from './utils';
import { isFictionalSlug } from './fictional-slugs';

/**
 * Data access for the public lawsuit catalog.
 *
 * List queries hide closed rows and past-deadline rows. Deadline comparison
 * uses UTC calendar days (see todayISO). Sample fallback is DEV ONLY — in
 * production an empty or error result is an empty list / null.
 */

function supabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function allowSampleFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function isOpenForList(l: Lawsuit): boolean {
  if (isFictionalSlug(l.slug)) return false;
  if (l.review_status === 'rejected') return false;
  if (l.status === 'closed' || l.status === 'draft') return false;
  if (l.deadline && l.deadline < todayISO()) return false;
  return true;
}

function applyListFilters(
  list: Lawsuit[],
  opts?: {
    category?: string;
    q?: string;
    featured?: boolean;
    limit?: number;
    closingSoon?: boolean;
  },
): Lawsuit[] {
  let next = list.filter(isOpenForList);
  if (opts?.featured) next = next.filter((l) => l.is_featured);
  if (opts?.category) next = next.filter((l) => l.category === opts.category);
  if (opts?.q) {
    const q = opts.q.toLowerCase();
    next = next.filter((l) => l.title.toLowerCase().includes(q));
  }
  if (opts?.closingSoon) {
    next = next
      .filter((l) => {
        const days = daysUntil(l.deadline);
        return days !== null && days >= 0;
      })
      .sort((a, b) => {
        const da = daysUntil(a.deadline) ?? 9999;
        const db = daysUntil(b.deadline) ?? 9999;
        return da - db;
      });
  }
  if (opts?.limit) next = next.slice(0, opts.limit);
  return next;
}

export async function getLawsuits(opts?: {
  category?: string;
  q?: string;
  featured?: boolean;
  limit?: number;
  /** Open published rows sorted by nearest deadline (home "Closing soon"). */
  closingSoon?: boolean;
}): Promise<Lawsuit[]> {
  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      const today = todayISO();
      let query = supabase
        .from('lawsuits')
        .select('*')
        .eq('review_status', 'published')
        .neq('status', 'closed')
        .or(`deadline.is.null,deadline.gte.${today}`)
        .order('is_featured', { ascending: false })
        .order('deadline', { ascending: true, nullsFirst: false });

      if (opts?.category) query = query.eq('category', opts.category);
      if (opts?.featured) query = query.eq('is_featured', true);
      if (opts?.q) query = query.ilike('title', `%${opts.q}%`);
      if (opts?.limit && !opts?.closingSoon) query = query.limit(opts.limit);

      const { data, error } = await query;
      if (!error && data) {
        return applyListFilters(data as Lawsuit[], opts);
      }
    } catch {
      // fall through
    }
  }

  if (!allowSampleFallback()) return [];
  return applyListFilters([...SAMPLE_LAWSUITS], opts);
}

export type LawsuitLookup =
  | { status: 'ok'; lawsuit: Lawsuit }
  | { status: 'gone' }
  | { status: 'missing' };

/**
 * Detail lookup. Returns closed rows (so expired pages stay live) but treats
 * fictional/rejected slugs as gone.
 */
export async function lookupLawsuitBySlug(slug: string): Promise<LawsuitLookup> {
  if (isFictionalSlug(slug)) return { status: 'gone' };

  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('lawsuits')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (data) {
        const lawsuit = data as Lawsuit;
        if (lawsuit.review_status === 'rejected' || isFictionalSlug(lawsuit.slug)) {
          return { status: 'gone' };
        }
        return { status: 'ok', lawsuit };
      }
    } catch {
      // fall through
    }
  }

  if (allowSampleFallback()) {
    const sample = SAMPLE_LAWSUITS.find((l) => l.slug === slug);
    if (sample) return { status: 'ok', lawsuit: sample };
  }
  return { status: 'missing' };
}

export async function getLawsuitBySlug(slug: string): Promise<Lawsuit | null> {
  const result = await lookupLawsuitBySlug(slug);
  return result.status === 'ok' ? result.lawsuit : null;
}

export async function getSimilarOpenLawsuits(
  category: string,
  excludeSlug: string,
  limit = 3,
): Promise<Lawsuit[]> {
  const list = await getLawsuits({ category, limit: limit + 4 });
  return list.filter((l) => l.slug !== excludeSlug).slice(0, limit);
}

export async function getCategories(): Promise<string[]> {
  const all = await getLawsuits();
  return Array.from(new Set(all.map((l) => l.category))).sort();
}

/** Status badge: closed when the deadline has passed, even if DB status is still open. */
export function computedLawsuitStatus(lawsuit: Lawsuit): LawsuitStatus {
  if (lawsuit.status === 'closed' || lawsuit.status === 'draft') return lawsuit.status;
  const days = daysUntil(lawsuit.deadline);
  if (days !== null && days < 0) return 'closed';
  if (days !== null && days >= 0 && days <= 30) return 'closing_soon';
  return lawsuit.status === 'closing_soon' ? 'closing_soon' : 'open';
}

export function isClaimWindowClosed(lawsuit: Lawsuit): boolean {
  return computedLawsuitStatus(lawsuit) === 'closed';
}
