import { NextResponse } from 'next/server';
import { appLegalDisclaimer, appShortDisclaimer } from '@/lib/disclaimer-flags';
import { clientFlagValues } from '@/lib/flags';
import { oneClickEnabledFor, oneClickTestMode, type OneClickViewer } from '@/lib/filing/one-click-access';
import { legalContact } from '@/lib/legal-contact';
import { MOBILE_API_VERSION, type ClientConfig } from '@/lib/mobile-contract';
import { SETTLEMENT_GUIDES, SETTLEMENT_GUIDES_VERSION } from '@/lib/settlement-guides';
import { getRequestUser } from '@/lib/supabase/request-user';
import { todayInDeadlineZone } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };

/** A whole build number, or 0 (no minimum): a typo in the env must never lock everyone out. */
function minBuild(value: string | undefined): number {
  const trimmed = value?.trim() ?? '';
  const build = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
  return Number.isSafeInteger(build) ? build : 0;
}

/**
 * Who is asking, for the one-click gate. Read only in test mode and only from
 * a bearer token the app chose to send: otherwise the answer is the same for
 * everyone, exactly as before (no sign-in read).
 */
async function oneClickViewer(req: Request): Promise<OneClickViewer | null> {
  if (!oneClickTestMode() || !/^bearer\s/i.test(req.headers.get('authorization') ?? '')) return null;
  const auth = await getRequestUser(req);
  return auth.user ? { kind: 'member', email: auth.user.email } : null;
}

/**
 * GET /api/mobile/config: what the native app reads before anything else.
 * Flags are server env vars and read as off on a device, so the app takes the
 * allow-listed ones from here, with the server clock, the legal text (the
 * app's wording of the website's disclaimers) and the official-notice guides
 * its catalog overlays. No sign-in. ?guides=<version> names the guides the app
 * already has: the list (about 20 KB) is then sent only when it differs.
 * ONE_CLICK_FILING_ENABLED is the one-click gate for the caller
 * (src/lib/filing/one-click-access.ts): in test mode, on only for an
 * INTERNAL_EMAILS tester who sent a bearer token.
 */
export async function GET(req: Request) {
  const now = new Date();
  const appHas = new URL(req.url).searchParams.get('guides');
  const flags = { ...clientFlagValues(), ONE_CLICK_FILING_ENABLED: oneClickEnabledFor(await oneClickViewer(req)) };
  const body: ClientConfig = {
    apiVersion: MOBILE_API_VERSION,
    serverTime: now.toISOString(),
    todayDeadlineZone: todayInDeadlineZone(now),
    flags,
    legal: { disclaimer: appLegalDisclaimer(), short: appShortDisclaimer(), contactEmail: legalContact().email },
    minBuild: {
      ios: minBuild(process.env.MOBILE_MIN_BUILD_IOS),
      android: minBuild(process.env.MOBILE_MIN_BUILD_ANDROID),
    },
    guidesVersion: SETTLEMENT_GUIDES_VERSION,
    ...(appHas === SETTLEMENT_GUIDES_VERSION ? {} : { guides: SETTLEMENT_GUIDES }),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
