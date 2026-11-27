'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { flags } from '@/lib/flags';
import { MATCH_PREVIEW_COOKIE } from '@/lib/match-preview';
import { createClient } from '@/lib/supabase/server';
import { mergeAttributes, parseAttributeAnswers } from '@/lib/profile-attributes';
import { recordFactConsent } from '@/lib/consent';
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
    await recordFactConsent(supabase, user.id, facts.facts);
  }

  await clearPreviewMirror();
  return { ok: true };
}

/**
 * Drops the `cm_preview` mirror once onboarding is done, the way the wizard
 * drops its localStorage copy. Best effort: a cookie that cannot be written
 * must never fail a save that already succeeded.
 */
async function clearPreviewMirror(): Promise<void> {
  try {
    (await cookies()).set(MATCH_PREVIEW_COOKIE, '', { path: '/', maxAge: 0 });
  } catch {
    /* read-only cookie store */
  }
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
  const saved = await writeProfile({ onboarded: true });
  if (saved.ok) await clearPreviewMirror();
  return saved;
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

  // `.select('id')` so a zero-row update is not read as success: PostgREST
  // reports no error when nothing matched, and only the handle_new_user trigger
  // creates the profiles row (client INSERT was revoked in migration 0032), so
  // a missing row would otherwise make Skip claim it saved while writing
  // nothing — and the dashboard card and the 24h drip would then contradict it.
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id');
  if (error) {
    console.error('[onboarding] profile update failed', { code: error.code ?? null });
    return { ok: false, error: 'We couldn’t save your details. Please try again.' };
  }
  if (!data || data.length === 0) {
    // No user id in the log: the row is missing, which is all we need to know.
    console.error('[onboarding] profile update matched no row');
    return { ok: false, error: 'We couldn’t save your details. Please try again.' };
  }
  return { ok: true };
}
