import AsyncStorage from '@react-native-async-storage/async-storage';

import { LargeSecureStore } from '@/lib/secure-session-storage';
import { AUTH_STORAGE_KEY, getSupabase, installWebCrypto, signOutOnThisDevice } from '@/lib/supabase';

// In-memory Keychain. `mock` prefix: jest.mock factories may only use such variables.
const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

// expo-crypto backed by Node's crypto (the native module is absent under Jest).
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' },
    getRandomValues: <T extends ArrayBufferView>(array: T): T => nodeCrypto.randomFillSync(array),
    digest: jest.fn(async (algorithm: string, data: Uint8Array) => {
      const hash: Uint8Array = nodeCrypto.createHash(algorithm.replace('-', '').toLowerCase()).update(data).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    }),
  };
});

jest.mock('@/lib/env', () => ({
  requireEnv: () => ({
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    supabaseAnonKey: 'anon-key',
    apiBaseUrl: 'https://lawsuitai.test',
  }),
}));

// Node's crypto, for the expected SHA-256 (the app's tsconfig has no Node types).
const { createHash } = require('node:crypto') as {
  createHash(algorithm: 'sha256'): { update(data: string): { digest(encoding: 'base64url'): string } };
};

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
});

describe('installWebCrypto', () => {
  it('gives auth-js a SHA-256 digest on Hermes, so PKCE uses S256 instead of plain', async () => {
    // Hermes has no crypto global.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    installWebCrypto();

    const { getCodeChallengeAndMethod } = require('@supabase/auth-js/dist/main/lib/helpers');
    const saved = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => saved.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        saved.set(key, value);
      },
      removeItem: async (key: string) => {
        saved.delete(key);
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [challenge, method] = await getCodeChallengeAndMethod(storage, 'test-auth');

    const verifier = JSON.parse(saved.get('test-auth-code-verifier')!) as string;
    expect(method).toBe('s256');
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps an existing getRandomValues and rejects digests it does not support', async () => {
    const getRandomValues = jest.fn();
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true, writable: true });
    installWebCrypto();

    const installed = globalThis.crypto as unknown as { getRandomValues: unknown; subtle: SubtleCrypto };
    expect(installed.getRandomValues).toBe(getRandomValues);
    await expect(installed.subtle.digest('MD5', new Uint8Array([1]))).rejects.toThrow('Unsupported digest algorithm');
  });
});

describe('signOutOnThisDevice', () => {
  it('removes a session auth-js cannot load (expired token, Supabase unreachable) and fires SIGNED_OUT', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // No signal: every request to Supabase fails.
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));

    // The app was in the background for over an hour: the stored access token has expired.
    const expired = {
      access_token: 'expired-access-token',
      refresh_token: 'refresh-token-1',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 600,
      user: { id: 'user-1', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    };
    await new LargeSecureStore().setItem(AUTH_STORAGE_KEY, JSON.stringify(expired));
    await new LargeSecureStore().setItem(`${AUTH_STORAGE_KEY}-code-verifier`, JSON.stringify('verifier'));

    const { auth } = getSupabase();
    const events: string[] = [];
    auth.onAuthStateChange((event) => {
      events.push(event);
    });

    // Without the fallback, auth-js itself returns an error and keeps everything.
    const plain = auth.signOut({ scope: 'local' });
    await jest.advanceTimersByTimeAsync(60_000);
    const { error: plainError } = await plain;
    expect(plainError?.name).toBe('AuthRetryableFetchError');
    await expect(AsyncStorage.getItem(AUTH_STORAGE_KEY)).resolves.not.toBeNull();

    const outcome = signOutOnThisDevice();
    await jest.advanceTimersByTimeAsync(60_000);

    await expect(outcome).resolves.toEqual({ error: null });
    const left = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(AUTH_STORAGE_KEY));
    expect(left).toEqual([]);
    expect(mockKeychain.size).toBe(0);
    expect(events).toContain('SIGNED_OUT');
    const { data } = await auth.getSession();
    expect(data.session).toBeNull();
  });
});
