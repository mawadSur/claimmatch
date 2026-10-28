import { z } from 'zod';
import { parseAttributeAnswers } from './profile-attributes';
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
  address_line1: z.string().trim().max(200, 'Keep the address under 200 characters.').optional(),
  address_line2: z.string().trim().max(200, 'Keep the address under 200 characters.').optional(),
  city: z.string().trim().max(120, 'Keep the city under 120 characters.').optional(),
  prefill_consent_at: z.string().trim().max(40).optional(),
  match_metrics_consent: z.boolean().optional(),
});

export interface SettingsPatch {
  email_opt_in?: boolean;
  full_name?: string | null;
  state?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  prefill_consent_at?: string | null;
  match_metrics_consent_at?: string | null;
  attributes?: Record<string, unknown>;
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

  const {
    email_opt_in,
    full_name,
    state,
    phone,
    address_line1,
    address_line2,
    city,
    prefill_consent_at,
    match_metrics_consent,
  } = parsed.data;
  const patch: SettingsPatch = {};
  if (email_opt_in !== undefined) patch.email_opt_in = email_opt_in;
  // An emptied field clears the stored value instead of saving "".
  if (full_name !== undefined) patch.full_name = full_name || null;
  if (state !== undefined) patch.state = state || null;
  if (phone !== undefined) patch.phone = phone || null;
  if (address_line1 !== undefined) patch.address_line1 = address_line1 || null;
  if (address_line2 !== undefined) patch.address_line2 = address_line2 || null;
  if (city !== undefined) patch.city = city || null;
  // Consent is sticky: once set, an empty string does not clear it.
  if (prefill_consent_at) patch.prefill_consent_at = prefill_consent_at;
  if (match_metrics_consent === true) patch.match_metrics_consent_at = new Date().toISOString();
  if (match_metrics_consent === false) patch.match_metrics_consent_at = null;

  if ('attributes' in body) {
    const attrs = parseAttributeAnswers((body as { attributes?: unknown }).attributes);
    if (!attrs.ok) return { ok: false, error: attrs.error };
    patch.attributes = attrs.attributes;
  }
  return { ok: true, patch };
}
