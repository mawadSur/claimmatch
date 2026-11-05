import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { LargeSecureStore } from '@/lib/secure-session-storage';

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

jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends Uint8Array>(array: T): T => require('node:crypto').randomFillSync(array),
}));

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;

const KEY = 'claimmatch-auth';
const SESSION_1 = JSON.stringify({ access_token: 'A1', refresh_token: 'R1', user: { id: 'u1' } });
const SESSION_2 = JSON.stringify({ access_token: 'A2', refresh_token: 'R2', user: { id: 'u1' } });

/** Holds the next AsyncStorage write until `release()`. */
function gateNextAsyncStorageWrite(): { release: () => void; started: Promise<void> } {
  const write = AsyncStorage.setItem;
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const startedPromise = new Promise<void>((resolve) => {
    started = () => resolve();
  });
  jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key: string, value: string) => {
    started();
    await opened;
    return write(key, value);
  });
  return { release, started: startedPromise };
}

beforeEach(async () => {
  jest.restoreAllMocks();
  mockKeychain.clear();
  getItemAsync.mockClear();
  setItemAsync.mockClear();
  await AsyncStorage.clear();
});

describe('LargeSecureStore', () => {
  it('stores only ciphertext in AsyncStorage and reads the value back', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION_1);

    const raw = await AsyncStorage.getItem(KEY);
    expect(raw).toMatch(/^cm1\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]+$/);
    expect(raw).not.toContain('R1');
    await expect(store.getItem(KEY)).resolves.toBe(SESSION_1);
    // A new process reads the key from SecureStore.
    await expect(new LargeSecureStore().getItem(KEY)).resolves.toBe(SESSION_1);
  });

  it('keeps one key per storage key and seals every write with a fresh counter', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION_1);
    const first = await AsyncStorage.getItem(KEY);
    await store.setItem(KEY, SESSION_1);
    const second = await AsyncStorage.getItem(KEY);

    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(first?.split('.')[1]).toBe(second?.split('.')[1]); // same key id
    expect(first?.split('.')[2]).not.toBe(second?.split('.')[2]); // new counter
    expect(first).not.toBe(second);
  });

  it('never shows a reader a half-saved refresh: a read during a write returns the new session', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION_1);

    const gate = gateNextAsyncStorageWrite();
    const saving = store.setItem(KEY, SESSION_2);
    await gate.started;
    let read: string | null | undefined;
    const reading = store.getItem(KEY).then((value) => {
      read = value;
    });
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(read).toBeUndefined(); // the read waits for the write in progress
    gate.release();
    await Promise.all([saving, reading]);

    expect(read).toBe(SESSION_2);
  });

  it('applies concurrent writes in call order and creates a single key', async () => {
    const store = new LargeSecureStore();
    await Promise.all([store.setItem(KEY, SESSION_1), store.setItem(KEY, SESSION_2)]);

    expect(setItemAsync).toHaveBeenCalledTimes(1);
    await expect(store.getItem(KEY)).resolves.toBe(SESSION_2);
  });

  it('reads a value sealed with another key as null instead of garbage', async () => {
    await new LargeSecureStore().setItem(KEY, SESSION_1);
    // The Keychain entry was replaced (for example lost and recreated): same storage key, different AES key.
    const other = new LargeSecureStore();
    mockKeychain.clear();
    await other.setItem('elsewhere', SESSION_2);
    mockKeychain.set(KEY, mockKeychain.get('elsewhere')!);

    await expect(new LargeSecureStore().getItem(KEY)).resolves.toBeNull();
  });

  it('reads as null when the key is missing or unreadable, then recovers on the next write', async () => {
    await new LargeSecureStore().setItem(KEY, SESSION_1);
    mockKeychain.clear();
    await expect(new LargeSecureStore().getItem(KEY)).resolves.toBeNull();

    const store = new LargeSecureStore();
    getItemAsync.mockRejectedValueOnce(new Error('Could not decrypt the item'));
    await expect(store.getItem(KEY)).resolves.toBeNull();
    await store.setItem(KEY, SESSION_2);
    await expect(store.getItem(KEY)).resolves.toBe(SESSION_2);
  });

  it('reads a value in an older or damaged format as null', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION_1);
    const [, id, counter, cipher] = (await AsyncStorage.getItem(KEY))!.split('.');

    for (const damaged of [cipher, `cm0.${id}.${counter}.${cipher}`, `cm1.${id}.${counter}`, `cm1.${id}.zz.${cipher}`]) {
      await AsyncStorage.setItem(KEY, damaged);
      await expect(store.getItem(KEY)).resolves.toBeNull();
    }
  });

  it('removes the value together with its key', async () => {
    const store = new LargeSecureStore();
    await store.setItem(KEY, SESSION_1);
    const oldId = (await AsyncStorage.getItem(KEY))!.split('.')[1];

    await store.removeItem(KEY);
    await expect(AsyncStorage.getItem(KEY)).resolves.toBeNull();
    expect(mockKeychain.size).toBe(0);
    await expect(store.getItem(KEY)).resolves.toBeNull();

    await store.setItem(KEY, SESSION_2);
    expect((await AsyncStorage.getItem(KEY))!.split('.')[1]).not.toBe(oldId);
    await expect(store.getItem(KEY)).resolves.toBe(SESSION_2);
  });

  it('removeAll clears the session, user and every PKCE verifier, and nothing else', async () => {
    const store = new LargeSecureStore();
    const ours = [
      KEY,
      `${KEY}-user`,
      `${KEY}-code-verifier`,
      `${KEY}-flows-code-verifier`,
      `${KEY}-flow-0123456789abcdef-code-verifier`,
    ];
    for (const key of ours) await store.setItem(key, '"value"');
    await store.setItem('claimmatch-authority', '"keep"');
    await AsyncStorage.setItem('unrelated', 'keep');

    await store.removeAll(KEY);

    for (const key of ours) await expect(store.getItem(key)).resolves.toBeNull();
    await expect(store.getItem('claimmatch-authority')).resolves.toBe('"keep"');
    await expect(AsyncStorage.getItem('unrelated')).resolves.toBe('keep');
    expect([...mockKeychain.keys()]).toEqual(['claimmatch-authority']);
  });
});
