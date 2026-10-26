import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
 * Cookie-free anon client for the public catalog. Settlement landing pages and
 * hubs statically generate / ISR; using cookies() here would force them dynamic.
 * RLS still applies (anon can read published rows).
 */
export function createPublicClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Service-role client for trusted server jobs (scraping, matching, cron).
 * Bypasses RLS — NEVER import this into client code. Falls back to the anon
 * key if no service role is configured so builds don't crash, except in
 * production with a real project: there the anon key would quietly hide rows
 * (every unpublished settlement, every user's claims) and refuse writes, so
 * pages and jobs would "succeed" with wrong data. It throws instead, and the
 * page's error boundary or the route's error handling shows the failure.
 */
export function createServiceClient() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      FALLBACK_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
