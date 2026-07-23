import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getEnvReport } from '@/lib/env';
import { log } from '@/lib/log';

// Live probe: must hit the DB on every request, never statically cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG = 'health';

type DbProbe = { ok: boolean; error?: string; latencyMs?: number };

/**
 * Cheap connectivity probe: a HEAD-style count on lawsuits. Wrapped so a
 * failure yields a "degraded" report rather than throwing a 500 out of the
 * handler. Only runs when Supabase is configured.
 */
async function probeDatabase(): Promise<DbProbe> {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('lawsuits')
      .select('*', { count: 'exact', head: true });
    const latencyMs = Date.now() - start;
    if (error) {
      log.error(TAG, 'DB probe failed', { message: error.message });
      return { ok: false, error: error.message, latencyMs };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error(TAG, 'DB probe threw', { message });
    return { ok: false, error: message, latencyMs: Date.now() - start };
  }
}

/**
 * GET /api/health — readiness/liveness endpoint.
 *
 * - 200 "ok"        : sample-fallback mode, or DB configured and reachable.
 * - 503 "degraded"  : DB configured but unreachable.
 *
 * Returns env presence booleans only — NEVER secret values.
 */
export async function GET() {
  const env = getEnvReport();
  const configured = isSupabaseConfigured();

  const database: DbProbe | { ok: null; skipped: true } = configured
    ? await probeDatabase()
    : { ok: null, skipped: true };

  const unreachable = configured && database.ok === false;
  const status = unreachable ? 'degraded' : 'ok';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      mode: env.mode,
      supabaseConfigured: configured,
      database,
      env: {
        supabaseConfigured: env.supabaseConfigured,
        serviceRoleConfigured: env.serviceRoleConfigured,
        vars: env.vars,
      },
    },
    { status: unreachable ? 503 : 200 },
  );
}
