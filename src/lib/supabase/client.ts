'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client (uses the public anon key + user session).
 * Safe to import in client components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  );
}

/** Whether real Supabase credentials are present in the browser bundle. */
export function isSupabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
