import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { jsonApiNotFound } from '@/lib/api-not-found';
import { isJsonRequest } from '@/lib/json-request';
import { sanitizeRef, sanitizeUtm } from '@/lib/attribution';
import {
  BETA_INVITE_UTM_CAMPAIGN,
  BETA_INVITE_UTM_MEDIUM,
  BETA_INVITE_UTM_SOURCE,
  betaInviteDestination,
  betaInviteUrl,
  loadBetaInviteStats,
  newBetaInviteCode,
  sanitizeBetaInviteLabel,
} from '@/lib/beta-invite';
import { shortShareUrl } from '@/lib/share-links';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/utils';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  label: z.string().trim().max(80),
  code: z.string().trim().max(32).optional(),
});

async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) return null;
  return admin;
}

/** GET /api/admin/beta-invites — per-code funnel counts for the soft beta. */
export async function GET() {
  if (!flags.betaInviteCodes()) return jsonApiNotFound();
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  const invites = await loadBetaInviteStats();
  return NextResponse.json({ invites });
}

/** POST /api/admin/beta-invites — named share_links row with beta UTMs. */
export async function POST(req: Request) {
  if (!flags.betaInviteCodes()) return jsonApiNotFound();
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Add a name for this invite.' },
      { status: 400 },
    );
  }

  const label = sanitizeBetaInviteLabel(parsed.data.label);
  if (!label) {
    return NextResponse.json({ error: 'Add a name for this invite.' }, { status: 400 });
  }

  let code = sanitizeRef(parsed.data.code) || newBetaInviteCode();
  const destination = betaInviteDestination();
  const svc = createServiceClient();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await svc
      .from('share_links')
      .insert({
        code,
        destination,
        utm_source: sanitizeUtm(BETA_INVITE_UTM_SOURCE),
        utm_medium: sanitizeUtm(BETA_INVITE_UTM_MEDIUM),
        utm_campaign: sanitizeUtm(BETA_INVITE_UTM_CAMPAIGN),
        utm_content: sanitizeUtm(label.replace(/\s+/g, '-').toLowerCase().slice(0, 80)),
        label,
        created_by: admin.id,
      })
      .select('id, code, destination, label, created_at')
      .single();
    if (!error && data) {
      const origin = SITE.url;
      return NextResponse.json({
        invite: {
          ...data,
          destination: data.destination || destination,
          visits: 0,
          signups: 0,
          profilesCompleted: 0,
          matchesViewed: 0,
          officialFormsOpened: 0,
          filingsReported: 0,
          shortUrl: shortShareUrl(origin, data.code),
          inviteUrl: betaInviteUrl(origin, data.code),
        },
      });
    }
    if (error?.code === '23505') {
      if (parsed.data.code) {
        return NextResponse.json({ error: 'That code is already in use.' }, { status: 409 });
      }
      code = newBetaInviteCode();
      continue;
    }
    console.error('[beta-invites] insert failed', { code: error?.code });
    return NextResponse.json({ error: 'Could not create the invite.' }, { status: 500 });
  }
  return NextResponse.json({ error: 'Could not create the invite.' }, { status: 500 });
}
