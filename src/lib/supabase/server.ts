import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { log } from '@/lib/log';

// Harmless, syntactically-valid placeholders used when Supabase isn't
// configured (local/sample-data/first deploy). With no auth cookie present,
// getUser() short-circuits to a null user without any network call, so
// unauthenticated requests degrade to "signed out" instead of throwing.
const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_KEY = 'placeholder-anon-key';

export function isSupabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Server-side Supabase client bound to the request's cookies (RSC / route
 * handlers / server actions). Reads the user session from cookies and honors RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server jobs (scraping, matching, cron).
 * Bypasses RLS — NEVER import this into client code. Falls back to the anon
 * key if no service role is configured so builds don't crash.
 */
export function createServiceClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // If the app is otherwise configured but the service-role key is absent, we
  // fall back to the anon key. That silently breaks trusted server jobs (RLS
  // blocks their writes), so make the degradation LOUD instead of invisible.
  if (isSupabaseConfigured() && !serviceRoleKey) {
    log.warn(
      'supabase',
      'SUPABASE_SERVICE_ROLE_KEY is missing — service client is degrading to the anon key. ' +
        'RLS will block privileged writes (scraping, matching, cron). Set the service-role key in prod.',
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
