import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedStorage } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted storage for the Supabase session, after Supabase's
 * LargeSecureStore pattern for Expo (plan section 4).
 *
 * A session is larger than SecureStore safely holds, so each value is
 * encrypted with AES-256 (aes-js, CTR) and the ciphertext goes to
 * AsyncStorage. The key stays in the Keychain / Android Keystore through
 * expo-secure-store (AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable after the
 * first unlock and never restored to another device, so a restored backup
 * holds only ciphertext and the user simply signs in again).
 *
 * Each storage key has one AES key, created on its first write and deleted
 * with its value. Every write uses a fresh random 128-bit counter block, so a
 * key and counter pair is never reused, and stores that counter with the
 * ciphertext in one AsyncStorage value. A write is therefore a single step for
 * a reader: auth-js reads the session without locks (since 2.107) while a
 * token refresh is being saved, so a read must never pair a new key with an
 * old ciphertext. Each value also names the key it was written with, so a
 * value from another key (a lost Keychain entry, an older format) reads as
 * null on purpose instead of as garbage. Operations on one storage key run one
 * at a time, in call order.
 */

const WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Version tag of the AsyncStorage value: `cm1.<key id>.<counter>.<ciphertext>`, all hex. */
const FORMAT = 'cm1';
const KEY_BYTES = 32;
const KEY_ID_BYTES = 16;
const COUNTER_BYTES = 16;

/** Values auth-js keeps next to the session (see removeAll). */
const COMPANION_SUFFIXES = ['-user', '-code-verifier', '-flows-code-verifier'] as const;

interface StoredKey {
  /** Random id written into every value sealed with this key. */
  id: string;
  key: Uint8Array;
}

/** SecureStore keys may contain only letters, digits, ".", "-" and "_". */
function secureStoreKey(key: string): string {
  return key.replace(/[^\w.-]/g, '_');
}

function toHex(bytes: Uint8Array): string {
  return aesjs.utils.hex.fromBytes(bytes);
}

function isHex(value: string | undefined, byteLength?: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    return false;
  }
  return byteLength === undefined || value.length === byteLength * 2;
}

function randomBytes(length: number): Uint8Array {
  return Crypto.getRandomValues(new Uint8Array(length));
}

/** Reads a SecureStore record `<key id>.<key>`; anything else (an older format, damage) is no key. */
function parseKey(record: string | null): StoredKey | null {
  const [id, keyHex, ...rest] = record?.split('.') ?? [];
  if (rest.length > 0 || !isHex(id, KEY_ID_BYTES) || !isHex(keyHex, KEY_BYTES)) return null;
  return { id, key: Uint8Array.from(aesjs.utils.hex.toBytes(keyHex)) };
}

function seal(stored: StoredKey, value: string): string {
  const counter = randomBytes(COUNTER_BYTES);
  const cipher = new aesjs.ModeOfOperation.ctr(stored.key, new aesjs.Counter(counter));
  const ciphertext = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  return [FORMAT, stored.id, toHex(counter), toHex(ciphertext)].join('.');
}

/** The plaintext, or null when the value was not sealed with this key. */
function unseal(stored: StoredKey, sealed: string): string | null {
  const [format, id, counterHex, cipherHex, ...rest] = sealed.split('.');
  if (format !== FORMAT || rest.length > 0 || id !== stored.id) return null;
  if (!isHex(counterHex, COUNTER_BYTES) || !isHex(cipherHex)) return null;
  const counter = new aesjs.Counter(aesjs.utils.hex.toBytes(counterHex));
  const cipher = new aesjs.ModeOfOperation.ctr(stored.key, counter);
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
}

const ignore = () => undefined;

export class LargeSecureStore implements SupportedStorage {
  /** AES keys already read or created in this process, by storage key. */
  private readonly keys = new Map<string, StoredKey>();
  /** The last queued operation per storage key. */
  private readonly queues = new Map<string, Promise<void>>();

  getItem(key: string): Promise<string | null> {
    return this.serialized(key, async () => {
      const sealed = await AsyncStorage.getItem(key);
      if (!sealed) return null;
      const stored = await this.readKey(key);
      if (!stored) return null;
      try {
        return unseal(stored, sealed);
      } catch {
        return null;
      }
    });
  }

  setItem(key: string, value: string): Promise<void> {
    return this.serialized(key, async () => {
      const stored = (await this.readKey(key)) ?? (await this.createKey(key));
      await AsyncStorage.setItem(key, seal(stored, value));
    });
  }

  removeItem(key: string): Promise<void> {
    return this.serialized(key, async () => {
      await AsyncStorage.removeItem(key);
      this.keys.delete(key);
      try {
        await SecureStore.deleteItemAsync(secureStoreKey(key));
      } catch {
        // The value is gone; a key left behind decrypts nothing.
      }
    });
  }

  /**
   * Removes `prefix` and every `${prefix}-…` value with its key: for the auth
   * storage key that is the session, the user and every PKCE verifier. Used
   * when auth-js cannot sign out by itself (supabase.ts).
   */
  async removeAll(prefix: string): Promise<void> {
    const present = await AsyncStorage.getAllKeys();
    const keys = new Set<string>([
      prefix,
      ...COMPANION_SUFFIXES.map((suffix) => `${prefix}${suffix}`),
      ...present.filter((key) => key === prefix || key.startsWith(`${prefix}-`)),
    ]);
    for (const key of keys) await this.removeItem(key);
  }

  private async readKey(key: string): Promise<StoredKey | null> {
    const cached = this.keys.get(key);
    if (cached) return cached;
    let record: string | null;
    try {
      record = await SecureStore.getItemAsync(secureStoreKey(key));
    } catch {
      // Unreadable, for example after an Android restore dropped the Keystore entry.
      return null;
    }
    const stored = parseKey(record);
    if (stored) this.keys.set(key, stored);
    return stored;
  }

  /** A new key replaces a missing or unreadable one; it is cached only once SecureStore holds it. */
  private async createKey(key: string): Promise<StoredKey> {
    const stored: StoredKey = { id: toHex(randomBytes(KEY_ID_BYTES)), key: randomBytes(KEY_BYTES) };
    await SecureStore.setItemAsync(secureStoreKey(key), `${stored.id}.${toHex(stored.key)}`, WRITE_OPTIONS);
    this.keys.set(key, stored);
    return stored;
  }

  /** Runs `task` after every earlier operation on `key` has settled. */
  private serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const settled = result.then(ignore, ignore);
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return result;
  }
}
