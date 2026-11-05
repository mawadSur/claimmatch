import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';

import { requireEnv } from './env';
import { LargeSecureStore } from './secure-session-storage';

/**
 * Where auth-js keeps the session on this device. auth-js also writes
 * `${AUTH_STORAGE_KEY}-user` and the PKCE verifier keys
 * (`${AUTH_STORAGE_KEY}-code-verifier`, `-flows-code-verifier`,
 * `-flow-<id>-code-verifier`). Set explicitly so signOutOnThisDevice can
 * remove all of them.
 */
export const AUTH_STORAGE_KEY = 'claimmatch-auth';

const authStorage = new LargeSecureStore();

/** Web Crypto digest names and their expo-crypto equivalents. */
const DIGEST_ALGORITHMS: Readonly<Record<string, Crypto.CryptoDigestAlgorithm>> = {
  'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
};

/** crypto.subtle.digest backed by expo-crypto (native SHA). */
function digest(algorithm: string | { name?: string }, data: BufferSource): Promise<ArrayBuffer> {
  const name = (typeof algorithm === 'string' ? algorithm : (algorithm?.name ?? '')).toUpperCase();
  const native = DIGEST_ALGORITHMS[name];
  if (!native) return Promise.reject(new Error(`Unsupported digest algorithm: ${name || 'none'}`));
  return Crypto.digest(native, data);
}

type CryptoGlobal = { getRandomValues?: unknown; subtle?: unknown };

/**
 * auth-js uses Web Crypto: crypto.getRandomValues for the PKCE verifier and
 * crypto.subtle.digest('SHA-256') for the S256 code challenge. Without a
 * digest it silently falls back to the "plain" method. Hermes has neither, so
 * expo-crypto provides both (Supabase's Expo tutorial imports
 * react-native-get-random-values for the first).
 *
 * `subtle` gets `digest` only. auth-js getClaims() treats any `subtle` as full
 * Web Crypto and would then call importKey and verify, which are not
 * provided: the app never calls getClaims (the web API checks tokens).
 */
export function installWebCrypto(): void {
  const scope = globalThis as { crypto?: CryptoGlobal };
  const target: CryptoGlobal = scope.crypto ?? {};
  if (typeof target.getRandomValues !== 'function') target.getRandomValues = Crypto.getRandomValues;
  if (target.subtle == null) target.subtle = { digest };
  if (!scope.crypto) {
    Object.defineProperty(globalThis, 'crypto', { value: target, configurable: true, writable: true });
  }
}

let client: SupabaseClient | null = null;

/**
 * The app's single Supabase client (anon key, plus the user's session under
 * RLS). Created on first use, so the configuration error screen can render
 * without one when the environment is incomplete.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = requireEnv();
  installWebCrypto();
  const created = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  // Refresh tokens only while the app is in the foreground (supabase-js startAutoRefresh docs).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void created.auth.startAutoRefresh();
    else void created.auth.stopAutoRefresh();
  });
  client = created;
  return created;
}

/**
 * Signs out on this device only (scope 'local'), so web sessions stay signed
 * in.
 *
 * auth-js returns an error and keeps the stored session when it cannot load
 * the session first, for example when the access token has expired and the
 * refresh cannot reach Supabase (the app reopened with no signal). The stored
 * session, user and PKCE verifiers are then removed here, and signOut runs
 * once more: with nothing stored, auth-js does its own teardown, which fires
 * SIGNED_OUT and stops an in-flight refresh from saving its tokens again. The
 * server session is left to expire.
 *
 * Never throws. Resolves with an error only when this device could not
 * forget the session.
 */
export async function signOutOnThisDevice(): Promise<{ error: Error | null }> {
  const { auth } = getSupabase();
  try {
    const { error } = await auth.signOut({ scope: 'local' });
    if (!error) return { error: null };
  } catch {
    // Remove the stored session below instead.
  }
  try {
    await authStorage.removeAll(AUTH_STORAGE_KEY);
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('The session could not be removed from this device.') };
  }
  await auth.signOut({ scope: 'local' }).catch(() => undefined);
  return { error: null };
}
