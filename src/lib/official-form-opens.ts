/**
 * First-open-wins log of signed-in official-form clicks. Used by the 24-hour
 * "Did you file?" email. Service-role only. No-op when DID_YOU_FILE_EMAIL_ENABLED
 * is off.
 */
import { flags } from '@/lib/flags';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const OFFICIAL_FORM_OPENS_TABLE = 'official_form_opens';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shouldPersistOfficialFormOpen(enabled = flags.didYouFileEmail()): boolean {
  return enabled;
}

export async function persistOfficialFormOpen(input: {
  userId: string;
  lawsuitId: string;
  openedAt?: Date;
}): Promise<{ persisted: boolean; reason?: 'flag_off' | 'invalid' | 'unavailable' | 'error' }> {
  if (!shouldPersistOfficialFormOpen()) return { persisted: false, reason: 'flag_off' };
  if (!UUID_RE.test(input.userId) || !UUID_RE.test(input.lawsuitId)) {
    return { persisted: false, reason: 'invalid' };
  }
  if (!isSupabaseConfigured()) return { persisted: false, reason: 'unavailable' };
  try {
    const { error } = await createServiceClient()
      .from(OFFICIAL_FORM_OPENS_TABLE)
      .insert({
        user_id: input.userId,
        lawsuit_id: input.lawsuitId,
        opened_at: (input.openedAt ?? new Date()).toISOString(),
      });
    if (error && error.code !== '23505') {
      console.error('[official-form-opens] insert failed', { code: error.code });
      return { persisted: false, reason: 'error' };
    }
    return { persisted: true };
  } catch {
    return { persisted: false, reason: 'error' };
  }
}
