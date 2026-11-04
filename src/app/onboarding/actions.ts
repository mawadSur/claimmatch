'use server';

import { z } from 'zod';
import { flags } from '@/lib/flags';
import { createClient } from '@/lib/supabase/server';
import { mergeAttributes, parseAttributeAnswers } from '@/lib/profile-attributes';
import { parseProfileFacts } from '@/lib/profile-facts';
import { US_STATES } from '@/lib/utils';

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

const ProfileSchema = z.object({
  full_name: z.string().trim().max(120, 'Use 120 characters or fewer for your name.'),
  state: z
    .string()
    .trim()
    .refine((v) => v === '' || STATE_CODES.has(v), 'Pick your state from the list.'),
});

export type OnboardingField = 'full_name' | 'state' | 'attributes' | 'facts';
export type OnboardingResult =
  | { ok: true }
  | { ok: false; error: string; field?: OnboardingField; signedOut?: boolean };

/**
 * Saves the onboarding profile: name, state, and the matcher attributes
 * collected on the second step. Health answers are optional and only written
 * when the person chose Yes or No. It never asks for a ZIP code.
 */
export async function saveOnboardingProfile(input: {
  full_name: string;
  state: string;
  attributes?: unknown;
  facts?: unknown;
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

  const attrs = parseAttributeAnswers(input.attributes ?? {});
  if (!attrs.ok) {
    return { ok: false, error: attrs.error, field: 'attributes' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You were logged out. Please log in again.', signedOut: true };

  const { data: existing } = await supabase
    .from('profiles')
    .select('attributes')
    .eq('id', user.id)
    .maybeSingle();

  const saved = await writeProfile(
    {
      full_name: parsed.data.full_name,
      state: parsed.data.state || null,
      attributes: mergeAttributes(
        (existing?.attributes as Record<string, unknown> | null) ?? {},
        attrs.attributes,
      ),
      onboarded: true,
    },
    user.id,
    supabase,
  );
  if (!saved.ok) return saved;

  if (flags.profileV2() && input.facts !== undefined) {
    const facts = parseProfileFacts(input.facts, { source: 'onboarding' });
    if (!facts.ok) return { ok: false, error: facts.error, field: 'facts' };
    const replaced = await replaceOwnFacts(supabase, user.id, facts.facts);
    if (!replaced.ok) return replaced;
  }

  return { ok: true };
}

async function replaceOwnFacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  facts: Array<{ type: string; value: string; start_date?: string | null; end_date?: string | null; source?: string | null }>,
): Promise<OnboardingResult> {
  const { error: delErr } = await supabase.from('profile_facts').delete().eq('user_id', userId);
  if (delErr) {
    console.error('[onboarding] profile_facts delete failed', { code: delErr.code ?? null });
    return { ok: false, error: 'We couldn’t save your profile facts. Please try again.', field: 'facts' };
  }
  if (facts.length === 0) return { ok: true };
  const { error: insErr } = await supabase.from('profile_facts').insert(
    facts.map((fact) => ({
      user_id: userId,
      type: fact.type,
      value: fact.value,
      start_date: fact.start_date ?? null,
      end_date: fact.end_date ?? null,
      source: fact.source ?? 'onboarding',
    })),
  );
  if (insErr) {
    console.error('[onboarding] profile_facts insert failed', { code: insErr.code ?? null });
    return { ok: false, error: 'We couldn’t save your profile facts. Please try again.', field: 'facts' };
  }
  return { ok: true };
}

/** "Skip for now": no details saved, and the dashboard stops asking. */
export async function skipOnboarding(): Promise<OnboardingResult> {
  return writeProfile({ onboarded: true });
}

async function writeProfile(
  patch: Record<string, unknown>,
  knownUserId?: string,
  knownClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<OnboardingResult> {
  const supabase = knownClient ?? (await createClient());
  let userId = knownUserId;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You were logged out. Please log in again.', signedOut: true };
    userId = user.id;
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) {
    console.error('[onboarding] profile update failed', { code: error.code ?? null });
    return { ok: false, error: 'We couldn’t save your details. Please try again.' };
  }
  return { ok: true };
}
