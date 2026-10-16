'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { US_STATES } from '@/lib/utils';

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

const ProfileSchema = z.object({
  full_name: z.string().trim().max(120, 'Use 120 characters or fewer for your name.'),
  state: z
    .string()
    .trim()
    .refine((v) => v === '' || STATE_CODES.has(v), 'Pick your state from the list.'),
});

export type OnboardingField = 'full_name' | 'state';
export type OnboardingResult =
  | { ok: true }
  | { ok: false; error: string; field?: OnboardingField; signedOut?: boolean };

/**
 * Saves the onboarding profile: name and state only. No ZIP code: nothing
 * uses one yet (D50), so it isn't collected. It never touches
 * profiles.attributes (older answers there are kept until the counsel-gated
 * cleanup) and asks no health questions.
 */
export async function saveOnboardingProfile(input: {
  full_name: string;
  state: string;
}): Promise<OnboardingResult> {
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      error: issue?.message ?? 'Please check your details.',
      field: field === 'full_name' || field === 'state' ? field : undefined,
    };
  }
  return writeProfile({
    full_name: parsed.data.full_name,
    state: parsed.data.state || null,
    onboarded: true,
  });
}

/** "Skip for now": no details saved, and the dashboard stops asking. */
export async function skipOnboarding(): Promise<OnboardingResult> {
  return writeProfile({ onboarded: true });
}

async function writeProfile(patch: Record<string, unknown>): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You were logged out. Please log in again.', signedOut: true };

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    console.error('[onboarding] profile update failed', { code: error.code ?? null });
    return { ok: false, error: 'We couldn’t save your details. Please try again.' };
  }
  return { ok: true };
}
