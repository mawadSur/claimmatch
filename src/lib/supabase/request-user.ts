import { createClient as createSupabaseJs, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Server only: who is calling a user route. The native app sends
 * `Authorization: Bearer <access token>`; the web sends its session cookie.
 *
 * This lives apart from server.ts so the route tests that mock
 * '@/lib/supabase/server' with only createClient keep driving the cookie path.
 * The token is checked by Supabase Auth, never decoded here. The bearer client
 * is a separate cookie-free client: a global header on the cookie client would
 * give one request two identities, and supabase-js's accessToken option
 * disables supabase.auth.*.
 */

const BEARER = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/i;

/**
 * Supabase Auth's own verdicts on a token (bad_jwt, user_not_found,
 * session_not_found). Any other failure (Auth unreachable, a 5xx, a 429, a
 * proxy's error page) says nothing about the token, and a 401 for it would
 * make the app sign everyone out.
 */
const TOKEN_REJECTED_STATUSES = new Set([400, 401, 403]);

export type RequestUser =
  | { user: User; supabase: SupabaseClient; via: 'bearer' | 'cookie' }
  /**
   * `unavailable`: Supabase Auth could not check the bearer token. Answer 503
   * with AUTH_UNAVAILABLE, never 401.
   */
  | { user: null; supabase: null; via: 'bearer' | 'cookie'; unavailable?: true };

/** The body of that 503; the app shows `error` and keeps its session. */
export const AUTH_UNAVAILABLE = {
  error: 'We couldn’t confirm you’re logged in right now. Please try again in a minute.',
  code: 'auth_unavailable',
} as const;

/** PostgREST and RPC calls run as the token's user under RLS. */
export function createBearerClient(jwt: string): SupabaseClient {
  return createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/** A Bearer header is the only credential considered when present; otherwise the unchanged cookie session. */
export async function getRequestUser(req?: Request): Promise<RequestUser> {
  const header = req?.headers.get('authorization');
  // Anything that starts with the scheme is a bearer attempt: a bare "Bearer"
  // (fetch trims "Bearer " to it) or a mangled one ("Bearer,<jwt>") is refused,
  // never served as whoever the cookie belongs to.
  if (header && /^bearer/i.test(header)) {
    const jwt = BEARER.exec(header)?.[1];
    if (!jwt) return { user: null, supabase: null, via: 'bearer' }; // malformed: 401, never fall back to cookies
    const supabase = createBearerClient(jwt);
    const { data, error } = await supabase.auth.getUser(jwt); // validated by Supabase Auth
    if (error && !TOKEN_REJECTED_STATUSES.has(error.status ?? 0)) {
      // Name and status only: never the token or Auth's message.
      console.error('[auth] Supabase Auth could not check a bearer token', {
        name: error.name,
        status: error.status,
      });
      return { user: null, supabase: null, via: 'bearer', unavailable: true };
    }
    return error || !data.user
      ? { user: null, supabase: null, via: 'bearer' }
      : { user: data.user, supabase, via: 'bearer' };
  }
  const supabase = await createClient(); // the existing cookie path
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { user, supabase, via: 'cookie' } : { user: null, supabase: null, via: 'cookie' };
}
