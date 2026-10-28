import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import {
  exportAuthorizedClaims,
  type AuthorizedClaimExportRow,
} from '@/lib/administrators/export';
import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/claims-export?lawsuit_id=&format=csv|json
 * Authorized claims for one settlement. Off unless DIRECT_FILING_ENABLED=1.
 */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.directFiling()) {
    return NextResponse.json({ error: 'Direct filing export is turned off.' }, { status: 404 });
  }

  const url = new URL(req.url);
  const lawsuitId = url.searchParams.get('lawsuit_id') ?? '';
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  if (!/^[0-9a-f-]{36}$/i.test(lawsuitId)) {
    return NextResponse.json({ error: 'A settlement id is required.' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('claim_authorizations')
    .select(
      'claim_id, user_id, lawsuit_id, text_version, signed_at, claims(lawsuit_title), profiles(full_name, email, phone, state, zip, address_line1, address_line2, city)',
    )
    .eq('lawsuit_id', lawsuitId);

  if (error) {
    console.error('[claims-export] query failed', { code: error.code });
    return NextResponse.json({ error: 'Could not load authorized claims.' }, { status: 500 });
  }

  const raw = (data ?? []) as Array<{
    claim_id: string;
    user_id: string;
    lawsuit_id: string;
    text_version: string;
    signed_at: string;
    claims?: { lawsuit_title?: string } | { lawsuit_title?: string }[] | null;
    profiles?: Record<string, string | null> | Record<string, string | null>[] | null;
  }>;
  const rows: AuthorizedClaimExportRow[] = raw.map((row) => {
    const claim = Array.isArray(row.claims) ? row.claims[0] : row.claims;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const claimRec = (claim ?? {}) as { lawsuit_title?: string };
    const profileRec = (profile ?? {}) as Record<string, string | null>;
    return {
      claim_id: row.claim_id as string,
      user_id: row.user_id as string,
      lawsuit_id: row.lawsuit_id as string,
      lawsuit_title: claimRec.lawsuit_title ?? '',
      authorization_version: row.text_version as string,
      authorized_at: row.signed_at as string,
      full_name: profileRec.full_name ?? null,
      email: profileRec.email ?? null,
      phone: profileRec.phone ?? null,
      state: profileRec.state ?? null,
      zip: profileRec.zip ?? null,
      address_line1: profileRec.address_line1 ?? null,
      address_line2: profileRec.address_line2 ?? null,
      city: profileRec.city ?? null,
    };
  });

  const exported = exportAuthorizedClaims(rows, format);
  if (!exported.ok) {
    return NextResponse.json({ error: exported.error }, { status: 404 });
  }
  return new NextResponse(exported.body, {
    status: 200,
    headers: {
      'Content-Type': exported.contentType,
      'Content-Disposition': `attachment; filename="authorized-claims-${lawsuitId}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
}
