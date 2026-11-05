import { NextResponse } from 'next/server';
import { LEGAL_DISCLAIMER, SHORT_DISCLAIMER } from '@/lib/disclaimer';
import { clientFlagValues } from '@/lib/flags';
import { legalContact } from '@/lib/legal-contact';
import { MOBILE_API_VERSION, type ClientConfig } from '@/lib/mobile-contract';
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
 * allow-listed ones from here, with the server clock and the legal text. No
 * sign-in.
 */
export async function GET() {
  const now = new Date();
  const body: ClientConfig = {
    apiVersion: MOBILE_API_VERSION,
    serverTime: now.toISOString(),
    todayDeadlineZone: todayInDeadlineZone(now),
    flags: clientFlagValues(),
    legal: { disclaimer: LEGAL_DISCLAIMER, short: SHORT_DISCLAIMER, contactEmail: legalContact().email },
    minBuild: {
      ios: minBuild(process.env.MOBILE_MIN_BUILD_IOS),
      android: minBuild(process.env.MOBILE_MIN_BUILD_ANDROID),
    },
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
