import { z } from 'zod';
import { US_STATES } from './utils';

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

/**
 * What a signed-in user may change from Settings. z.object drops unknown keys,
 * so the retired SMS opt-in (sms_opt_in) and anything else a client sends is
 * never written. There is no SMS feature.
 */
const SettingsInput = z.object({
  email_opt_in: z.boolean().optional(),
  full_name: z.string().trim().max(120, 'Keep your name under 120 characters.').optional(),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || STATE_CODES.has(v), 'Choose a state from the list.')
    .optional(),
  phone: z
    .string()
    .trim()
    .max(32, 'That phone number is too long.')
    .regex(/^[0-9+().\-\s]*$/, 'Use only numbers, spaces and + - ( ) in your phone number.')
    .optional(),
});

export interface SettingsPatch {
  email_opt_in?: boolean;
  full_name?: string | null;
  state?: string | null;
  phone?: string | null;
}

export type SettingsParseResult =
  | { ok: true; patch: SettingsPatch }
  | { ok: false; error: string };

/** Validate a Settings request body and build the profile update. */
export function parseSettingsInput(body: unknown): SettingsParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const parsed = SettingsInput.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Check your details and try again.' };
  }

  const { email_opt_in, full_name, state, phone } = parsed.data;
  const patch: SettingsPatch = {};
  if (email_opt_in !== undefined) patch.email_opt_in = email_opt_in;
  // An emptied field clears the stored value instead of saving "".
  if (full_name !== undefined) patch.full_name = full_name || null;
  if (state !== undefined) patch.state = state || null;
  if (phone !== undefined) patch.phone = phone || null;
  return { ok: true, patch };
}
