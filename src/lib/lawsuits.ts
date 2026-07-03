import { createClient } from '@/lib/supabase/server';
import type { Lawsuit } from './types';
import { SAMPLE_LAWSUITS } from './sample-data';

/**
 * Data access for the public lawsuit catalog. Every function degrades
 * gracefully to SAMPLE_LAWSUITS when Supabase is not configured or empty, so
 * the site renders in every environment (local, preview, first deploy).
 */

function supabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getLawsuits(opts?: {
  category?: string;
  q?: string;
  featured?: boolean;
  limit?: number;
}): Promise<Lawsuit[]> {
  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      let query = supabase
        .from('lawsuits')
        .select('*')
        .neq('status', 'draft')
        .order('is_featured', { ascending: false })
        .order('deadline', { ascending: true, nullsFirst: false });

      if (opts?.category) query = query.eq('category', opts.category);
      if (opts?.featured) query = query.eq('is_featured', true);
      if (opts?.q) query = query.ilike('title', `%${opts.q}%`);
      if (opts?.limit) query = query.limit(opts.limit);

      const { data, error } = await query;
      // A configured DB is authoritative: return its rows even when empty (an
      // empty filtered result should show an empty state, not fake samples).
      // Only fall through to samples on genuine unavailability (error/throw).
      if (!error && data) return data as Lawsuit[];
    } catch {
      // fall through to sample data
    }
  }

  // Fallback (Supabase not configured, or the query failed)
  let list = [...SAMPLE_LAWSUITS];
  if (opts?.featured) list = list.filter((l) => l.is_featured);
  if (opts?.category) list = list.filter((l) => l.category === opts.category);
  if (opts?.q) {
    const q = opts.q.toLowerCase();
    list = list.filter((l) => l.title.toLowerCase().includes(q));
  }
  if (opts?.limit) list = list.slice(0, opts.limit);
  return list;
}

export async function getLawsuitBySlug(slug: string): Promise<Lawsuit | null> {
  if (supabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from('lawsuits')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (data) return data as Lawsuit;
    } catch {
      // fall through
    }
  }
  return SAMPLE_LAWSUITS.find((l) => l.slug === slug) ?? null;
}

export async function getCategories(): Promise<string[]> {
  const all = await getLawsuits();
  return Array.from(new Set(all.map((l) => l.category))).sort();
}
