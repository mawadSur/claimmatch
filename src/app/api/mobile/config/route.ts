import { NextResponse } from 'next/server';
import { APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { clientFlagValues } from '@/lib/flags';
import { legalContact } from '@/lib/legal-contact';
import { MOBILE_API_VERSION, type ClientConfig } from '@/lib/mobile-contract';
import { SETTLEMENT_GUIDES, SETTLEMENT_GUIDES_VERSION } from '@/lib/settlement-guides';
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
 * GET /api/mobile/config: what the native app reads before anything else.
 * Flags are server env vars and read as off on a device, so the app takes the
 * allow-listed ones from here, with the server clock, the legal text (the
 * app's wording of the website's disclaimers) and the official-notice guides
 * its catalog overlays. No sign-in. ?guides=<version> names the guides the app
 * already has: the list (about 20 KB) is then sent only when it differs.
 */
export async function GET(req: Request) {
  const now = new Date();
  const appHas = new URL(req.url).searchParams.get('guides');
  const body: ClientConfig = {
    apiVersion: MOBILE_API_VERSION,
    serverTime: now.toISOString(),
    todayDeadlineZone: todayInDeadlineZone(now),
    flags: clientFlagValues(),
    legal: { disclaimer: APP_LEGAL_DISCLAIMER, short: APP_SHORT_DISCLAIMER, contactEmail: legalContact().email },
    minBuild: {
      ios: minBuild(process.env.MOBILE_MIN_BUILD_IOS),
      android: minBuild(process.env.MOBILE_MIN_BUILD_ANDROID),
    },
    guidesVersion: SETTLEMENT_GUIDES_VERSION,
    ...(appHas === SETTLEMENT_GUIDES_VERSION ? {} : { guides: SETTLEMENT_GUIDES }),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
