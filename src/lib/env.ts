import { log } from './log';

/**
 * Central environment inspection. Reports which relevant vars are set and
 * whether the app is running in "configured" mode (real Supabase) or
 * "sample-fallback" mode (no Supabase — renders the sample catalog).
 *
 * NEVER exposes secret values; only booleans about their presence. Nothing
 * here throws at import time — a missing var must not break local/sample mode.
 */

const TAG = 'env';

/** Env vars ClaimMatch cares about, grouped by role. */
const SERVER_ONLY = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'PARTNER_POSTBACK_SECRET',
] as const;

const PUBLIC_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
] as const;

type EnvKey = (typeof SERVER_ONLY)[number] | (typeof PUBLIC_VARS)[number];

function isSet(key: EnvKey): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

export type EnvReport = {
  /** "configured" once both public Supabase vars are present, else "sample-fallback". */
  mode: 'configured' | 'sample-fallback';
  /** True when real Supabase credentials are present (public URL + anon key). */
  supabaseConfigured: boolean;
  /** True when a service-role key is present (server jobs can bypass RLS to write). */
  serviceRoleConfigured: boolean;
  /** Presence booleans, one per inspected var. Never contains secret values. */
  vars: Record<EnvKey, boolean>;
};

/** Inspect the environment and report configuration state (booleans only). */
export function getEnvReport(): EnvReport {
  const vars = {} as Record<EnvKey, boolean>;
  for (const key of [...PUBLIC_VARS, ...SERVER_ONLY]) {
    vars[key] = isSet(key);
  }

  const supabaseConfigured =
    vars.NEXT_PUBLIC_SUPABASE_URL && vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    mode: supabaseConfigured ? 'configured' : 'sample-fallback',
    supabaseConfigured,
    serviceRoleConfigured: vars.SUPABASE_SERVICE_ROLE_KEY,
    vars,
  };
}

/**
 * Log a clear WARNING (never throws) when the app looks like a real deploy but
 * is missing server-side secrets. In sample-fallback mode we stay quiet — that
 * is the intended local/preview state. Call from server entry points that want
 * missing prod config to be visible in logs.
 */
export function assertServerEnv(): EnvReport {
  const report = getEnvReport();

  if (report.mode === 'sample-fallback') {
    // Intentional local/preview mode — surface it once at info level, no alarm.
    log.info(TAG, 'Running in sample-fallback mode (Supabase not configured).');
    return report;
  }

  // Supabase is configured, so this is a real deploy: any missing server secret
  // is a misconfiguration worth shouting about.
  const missing = SERVER_ONLY.filter((key) => !report.vars[key]);
  if (missing.length > 0) {
    log.warn(
      TAG,
      'Supabase is configured but server secrets are missing — some features are degraded.',
      { missing },
    );
  }

  if (!report.vars.NEXT_PUBLIC_SITE_URL) {
    log.warn(
      TAG,
      'NEXT_PUBLIC_SITE_URL is not set — absolute links/emails may point at the wrong host.',
    );
  }

  return report;
}
