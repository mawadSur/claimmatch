/**
 * Guard for scripts that write catalog rows (scripts/seed.ts and
 * scripts/run-scrape.ts). They run only against a local or staging database,
 * never production: the seed writes made-up settlements, and a scrape from a
 * laptop bypasses the deployed job's settings.
 *
 * A script may run only when CLAIMMATCH_ENV is exactly "local" or "staging",
 * and never when the Supabase URL or service key belongs to the production
 * project, whatever CLAIMMATCH_ENV says.
 */

/** The production Supabase project ref. */
export const PRODUCTION_PROJECT_REF = 'sfhhzkvrajxerqchvxcz';

export const SCRIPT_ENVIRONMENTS = ['local', 'staging'] as const;

export type ScriptTargetCheck = { ok: true; env: 'local' | 'staging' } | { ok: false; reason: string };

/** Environment variables, e.g. process.env. Reads CLAIMMATCH_ENV, the Supabase URL and the service key. */
type ScriptEnv = Readonly<Record<string, string | undefined>>;

/** The "ref" claim of a Supabase JWT key, or null for other key formats. */
function jwtProjectRef(key: string | undefined): string | null {
  if (!key) return null;
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { ref?: unknown };
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

export function checkScriptTarget(env: ScriptEnv): ScriptTargetCheck {
  const urls = [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL]
    .filter((u): u is string => !!u)
    .map((u) => u.toLowerCase());
  if (urls.some((u) => u.includes(PRODUCTION_PROJECT_REF))) {
    return {
      ok: false,
      reason: 'The Supabase URL points at the production project. This script never runs against production.',
    };
  }
  if (jwtProjectRef(env.SUPABASE_SERVICE_ROLE_KEY) === PRODUCTION_PROJECT_REF) {
    return {
      ok: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY belongs to the production project. This script never runs against production.',
    };
  }
  const target = (env.CLAIMMATCH_ENV ?? '').trim();
  if (target !== 'local' && target !== 'staging') {
    return {
      ok: false,
      reason: 'Set CLAIMMATCH_ENV=local or CLAIMMATCH_ENV=staging to say which database this is.',
    };
  }
  return { ok: true, env: target };
}
