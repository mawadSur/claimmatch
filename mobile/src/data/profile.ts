import { RETIRED_QUESTION_KEYS } from '@shared/lib/eligibility';
import {
  MATCHER_QUESTIONS,
  SENSITIVE_OPTIONAL_QUESTIONS,
  type AttributeAnswers,
} from '@shared/lib/profile-attributes';
import { parseSettingsInput } from '@shared/lib/settings-input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { shared } from '@/copy/shared';
import { ApiRequestError, getApi, unwrap } from '@/lib/api';
import { cancelAllReminders } from '@/lib/reminders';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

import { invalidInput, invalidResponse, supabaseReadError } from './errors';
import { dataKeys } from './keys';
import { okResponseSchema, profileRowSchema } from './schemas';

/**
 * The signed-in user's profile: read straight from Supabase under RLS ("own
 * profile read", as the web settings page does), changed only through
 * POST /api/settings, which validates, merges the matching answers and
 * stamps consent times (plan 1.1).
 *
 * The app never asks for or sends the health question (took_medication), and
 * never downloads its stored answer: the read asks for the matcher answers
 * one by one instead of the whole attributes column, and a save strips health
 * keys again (plan 5, Health data).
 */

/** Each matcher answer comes back as its own column, `answer_<key>` (a PostgREST JSON path). */
const ANSWER_COLUMN = 'answer_';
/** The matcher question keys (MATCHER_QUESTIONS), the only answers the app reads. */
export const MATCHER_KEYS: readonly string[] = MATCHER_QUESTIONS.map((question) => question.key);

export const PROFILE_COLUMNS = [
  'full_name',
  'state',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  ...MATCHER_KEYS.map((key) => `${ANSWER_COLUMN}${key}:attributes->${key}`),
  'email_opt_in',
  'onboarded',
  'prefill_consent_at',
  'match_metrics_consent_at',
  'referral_code',
].join(', ');

/** The profile as the app reads it. `attributes` holds only the matcher answers on file. */
export type AppProfile = z.output<typeof profileRowSchema> & { attributes: Record<string, unknown> };

const HEALTH_KEYS: ReadonlySet<string> = new Set([
  ...RETIRED_QUESTION_KEYS,
  ...SENSITIVE_OPTIONAL_QUESTIONS.map((question) => question.key),
]);

/** The attributes without health answers (took_medication). */
export function withoutHealthAnswers<T>(attributes: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !HEALTH_KEYS.has(key)));
}

/** The matcher answers of a row read with PROFILE_COLUMNS; an unanswered question has no key. */
function storedAnswers(row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const key of MATCHER_KEYS) {
    const value = row[`${ANSWER_COLUMN}${key}`];
    if (value !== null && value !== undefined) answers[key] = value;
  }
  return answers;
}

/** The user's profile, or null when the row does not exist yet. Throws ApiRequestError. */
export async function fetchProfile(userId: string, signal?: AbortSignal): Promise<AppProfile | null> {
  let query = getSupabase()
    .from('profiles')
    // Checked below (profileRowSchema, storedAnswers).
    .select<string, Record<string, unknown>>(PROFILE_COLUMNS)
    .eq('id', userId)
    // Personal data: never written to the platform HTTP cache on disk (plan
    // 3.2). Supabase answers without Cache-Control, and both native HTTP
    // stacks keep a disk cache that honors no-store on the request.
    .setHeader('Cache-Control', 'no-store');
  if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query.maybeSingle();
  if (error) throw supabaseReadError(error, status);
  if (data == null) return null;
  const parsed = profileRowSchema.safeParse(data);
  if (!parsed.success) throw invalidResponse(status);
  return { ...parsed.data, attributes: storedAnswers(data) };
}

/**
 * The signed-in user's profile (key ['profile', userId]); runs only while
 * signed in. `data` is null when the profile row does not exist yet.
 */
export function useProfile() {
  const { status, user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: dataKeys.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId, signal),
    enabled: status === 'signedIn' && userId !== '',
  });
}

/**
 * A POST /api/settings body (src/lib/settings-input.ts). Send only the fields
 * being changed; an empty string clears a text field. `attributes` replaces
 * every matching answer (answersFromAttributes / parseAttributeAnswers).
 */
export interface SettingsInput {
  email_opt_in?: boolean;
  full_name?: string;
  /** Two-letter code from US_STATES, or '' to clear. */
  state?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  /** ISO time the user agreed to keep copy-ready details; never cleared once set. */
  prefill_consent_at?: string;
  match_metrics_consent?: boolean;
  /** Finishing or skipping onboarding. */
  onboarded?: true;
  attributes?: AttributeAnswers;
}

/**
 * Saves settings. The body is checked on the device first with the server's
 * own rules (parseSettingsInput), so a mistake shows the same message without
 * a request. Reloads the profile, the dashboard (name, state, matches) and
 * the claim screens (copy-ready details).
 */
export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation<void, ApiRequestError, SettingsInput>({
    mutationFn: async (input) => {
      const body: SettingsInput = input.attributes
        ? { ...input, attributes: withoutHealthAnswers(input.attributes) }
        : input;
      const checked = parseSettingsInput(body);
      if (!checked.ok) throw invalidInput(checked.error);
      unwrap(
        await getApi().request('/api/settings', {
          method: 'POST',
          body,
          parse: (json) => okResponseSchema.parse(json),
        }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: dataKeys.profiles });
      void client.invalidateQueries({ queryKey: dataKeys.dashboard });
      void client.invalidateQueries({ queryKey: dataKeys.claims });
    },
  });
}

export interface DeleteAccountInput {
  /** What the user typed; must be exactly "DELETE". */
  confirm: string;
}

/**
 * POST /api/account/delete {confirm: "DELETE"}. Sends nothing unless the user
 * typed DELETE. On success the deadline reminders are already cancelled; the
 * screen then signs out (useAuth().signOut, which also clears personal data
 * from memory) and goes to /lawsuits.
 */
export function useDeleteAccount() {
  return useMutation<void, ApiRequestError, DeleteAccountInput>({
    mutationFn: async ({ confirm }) => {
      if (confirm !== 'DELETE') throw invalidInput(shared.typeDeleteToConfirm.text);
      unwrap(
        await getApi().request('/api/account/delete', {
          method: 'POST',
          body: { confirm: 'DELETE' },
          parse: (json) => okResponseSchema.parse(json),
        }),
      );
      await cancelAllReminders();
    },
  });
}
