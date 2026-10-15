import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { estimateLawsuitValue } from '@/lib/recovery';
import type { Lawsuit } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * POST /api/claims/prepare-all — create processing packets for every match
 * the user does not already have a claim for. Never marks anything submitted.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const [{ data: matchesData }, { data: claimsData }, { data: profile }] = await Promise.all([
    supabase
      .from('matches')
      .select('lawsuit_id, lawsuit:lawsuits(*)')
      .eq('user_id', user.id)
      .eq('dismissed', false),
    supabase.from('claims').select('lawsuit_id').eq('user_id', user.id),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  const claimed = new Set(
    ((claimsData ?? []) as { lawsuit_id: string }[]).map((c) => c.lawsuit_id),
  );
  const matches = ((matchesData ?? []) as unknown as {
    lawsuit_id: string;
    lawsuit?: Lawsuit | Lawsuit[] | null;
  }[]).map((m) => ({
    lawsuit_id: m.lawsuit_id,
    lawsuit: Array.isArray(m.lawsuit) ? (m.lawsuit[0] ?? null) : (m.lawsuit ?? null),
  }));

  const form_data = {
    full_name: profile?.full_name ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    zip: profile?.zip ?? '',
  };

  const created: { slug: string; id: string }[] = [];
  for (const match of matches) {
    const lawsuit = match.lawsuit;
    if (!lawsuit || claimed.has(match.lawsuit_id)) continue;
    if (!/^[0-9a-f-]{36}$/i.test(lawsuit.id)) continue;

    const { data, error } = await supabase
      .from('claims')
      .insert({
        user_id: user.id,
        lawsuit_id: lawsuit.id,
        lawsuit_title: lawsuit.title,
        status: 'processing',
        form_data,
        estimated_value: estimateLawsuitValue(lawsuit),
      })
      .select('id')
      .single();
    if (error) {
      if (error.code !== '23505') {
        console.error('[claims/prepare-all] insert failed:', error);
      }
      continue;
    }
    if (data) created.push({ slug: lawsuit.slug, id: data.id });
  }

  return NextResponse.json({ prepared: created.length, packets: created });
}
