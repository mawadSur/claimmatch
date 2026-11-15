import { NextResponse } from 'next/server';
import { buildAccountExport, type AccountExportConsent } from '@/lib/account-export';
import { loadOneClickExport } from '@/lib/account-export-filing';
import { factsFromRows } from '@/lib/profile-facts';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Claim, Match, Profile, ProfileFact } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/account/export — signed-in JSON copy of the user's stored data,
 * including one-click filing records (member-safe fields only). 503 when the
 * one-click records cannot be read, so an export is never silently partial.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  }

  const [
    { data: profileRow },
    { data: factRows },
    { data: consentRows },
    { data: matchRows },
    { data: claimRows },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('profile_facts')
      .select('type, value, start_date, end_date, source, created_at')
      .eq('user_id', user.id),
    supabase
      .from('consent')
      .select('category, granted_at, policy_version')
      .eq('user_id', user.id),
    supabase
      .from('matches')
      .select('score, reasons, dismissed, notified_at, lawsuit:lawsuits(title, slug)')
      .eq('user_id', user.id),
    supabase.from('claims').select('id, lawsuit_title, status').eq('user_id', user.id),
  ]);
  const oneClick = await loadOneClickExport({ member: supabase, service: createServiceClient(), userId: user.id });
  if (!oneClick.ok) {
    return NextResponse.json(
      { error: 'We couldn’t gather all of your data. Please try again in a few minutes.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const profile: Profile =
    (profileRow as Profile | null) ??
    ({
      id: user.id,
      email: user.email ?? null,
      full_name: null,
      state: null,
      zip: null,
      attributes: {},
      email_opt_in: false,
      onboarded: false,
      phone: null,
      sms_opt_in: false,
      referral_code: null,
      referred_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Profile);

  const payload = buildAccountExport({
    profile,
    facts: factsFromRows((factRows ?? []) as ProfileFact[]),
    consent: (consentRows ?? []) as AccountExportConsent[],
    matches: ((matchRows ?? []) as Array<
      Pick<Match, 'score' | 'reasons' | 'dismissed' | 'notified_at'> & {
        lawsuit?: { title?: string | null; slug?: string | null } | { title?: string | null; slug?: string | null }[] | null;
      }
    >).map((row) => ({
      ...row,
      lawsuit: Array.isArray(row.lawsuit) ? row.lawsuit[0] ?? null : row.lawsuit ?? null,
    })),
    claims: (claimRows ?? []) as Array<Pick<Claim, 'id' | 'status'> & { lawsuit_title?: string | null }>,
    oneClick: oneClick.data,
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="claimmatch-data.json"',
      'cache-control': 'no-store',
    },
  });
}
