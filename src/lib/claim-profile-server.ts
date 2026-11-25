/**
 * Load and save the shared claim profile (0051). Server only. RLS keeps
 * writes to the signed-in user. Never stores SSN, bank numbers, PINs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mergeClaimProfile,
  type ClaimProfile,
  type ClaimProfileAddress,
  type PayoutPreference,
} from './claim-profile';
import type { ProfilePrefillSource } from './claim-profile';

interface ClaimProfileRow {
  aliases: string | null;
  form_email: string | null;
  date_of_birth: string | null;
  payout_preference: PayoutPreference | null;
  vehicle_vin: string | null;
  account_emails: unknown;
  consent_at: string | null;
}

interface AddressRow {
  id: string;
  kind: 'current' | 'prior';
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  lived_from: string | null;
  lived_to: string | null;
}

function emailsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function storedFromRows(
  row: ClaimProfileRow | null,
  addresses: AddressRow[],
): Partial<ClaimProfile> | null {
  if (!row && addresses.length === 0) return null;
  return {
    aliases: row?.aliases ?? null,
    email: row?.form_email ?? null,
    date_of_birth: row?.date_of_birth ?? null,
    payout_preference: row?.payout_preference ?? null,
    vehicle_vin: row?.vehicle_vin ?? null,
    account_emails: emailsOf(row?.account_emails),
    addresses: addresses.map((a) => ({
      id: a.id,
      kind: a.kind,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      state: a.state,
      zip: a.zip,
      lived_from: a.lived_from,
      lived_to: a.lived_to,
    })),
    consent_at: row?.consent_at ?? null,
  };
}

export async function loadClaimProfile(
  supabase: SupabaseClient,
  userId: string,
  account?: ProfilePrefillSource | null,
): Promise<ClaimProfile> {
  const [{ data: row, error: extrasError }, { data: addressRows, error: addressError }, profileRead] = await Promise.all([
    supabase.from('claim_profiles').select('aliases, form_email, date_of_birth, payout_preference, vehicle_vin, account_emails, consent_at').eq('user_id', userId).maybeSingle(),
    supabase
      .from('claim_profile_addresses')
      .select('id, kind, line1, line2, city, state, zip, lived_from, lived_to')
      .eq('user_id', userId)
      .order('kind', { ascending: true }),
    account
      ? Promise.resolve({ data: account, error: null })
      : supabase.from('profiles').select('full_name, email, phone, address_line1, address_line2, city, state, zip').eq('id', userId).maybeSingle(),
  ]);
  // 0051 not applied yet: degrade to the existing profiles row.
  if (extrasError || addressError) {
    return mergeClaimProfile(null, (profileRead.data as ProfilePrefillSource | null) ?? account ?? null);
  }
  return mergeClaimProfile(
    storedFromRows((row as ClaimProfileRow | null) ?? null, (addressRows as AddressRow[] | null) ?? []),
    (profileRead.data as ProfilePrefillSource | null) ?? account ?? null,
  );
}

export async function saveClaimProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: ClaimProfile,
  profilePatch: Record<string, string | null>,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const consentAt = profile.consent_at ?? now.toISOString();
  const extras = {
    user_id: userId,
    aliases: profile.aliases,
    form_email: profile.email,
    date_of_birth: profile.date_of_birth,
    payout_preference: profile.payout_preference,
    vehicle_vin: profile.vehicle_vin,
    account_emails: profile.account_emails,
    consent_at: consentAt,
  };
  const { error: extrasError } = await supabase.from('claim_profiles').upsert(extras, { onConflict: 'user_id' });
  if (extrasError) {
    console.error('[claim-profile] extras upsert failed', { code: extrasError.code });
    return { ok: false, error: 'We couldn’t save your claim profile. Please try again.' };
  }

  const { error: deleteError } = await supabase.from('claim_profile_addresses').delete().eq('user_id', userId);
  if (deleteError) {
    console.error('[claim-profile] address reset failed', { code: deleteError.code });
    return { ok: false, error: 'We couldn’t save your addresses. Please try again.' };
  }
  if (profile.addresses.length > 0) {
    const rows = profile.addresses.map((a) => ({
      user_id: userId,
      kind: a.kind,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      state: a.state,
      zip: a.zip,
      lived_from: a.lived_from,
      lived_to: a.kind === 'current' ? null : a.lived_to,
    }));
    const { error: insertError } = await supabase.from('claim_profile_addresses').insert(rows);
    if (insertError) {
      console.error('[claim-profile] address insert failed', { code: insertError.code });
      return { ok: false, error: 'We couldn’t save your addresses. Please try again.' };
    }
  }

  const patch = { ...profilePatch };
  const { error: profileError } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (profileError) {
    console.error('[claim-profile] profiles patch failed', { code: profileError.code });
    return { ok: false, error: 'We saved the extra details but not your contact fields. Try again.' };
  }
  return { ok: true };
}

/** Packet answers + payout method name that a spec can prefill from the profile. */
export function packetSeedFromClaimProfile(
  profile: ClaimProfile,
  questionKeys: readonly string[],
  payoutOptions: readonly string[],
): { answers: Record<string, string>; payout_method: string | null } {
  const answers: Record<string, string> = {};
  const put = (key: string, value: string | null | undefined) => {
    if (!value?.trim()) return;
    if (questionKeys.includes(key)) answers[key] = value.trim();
  };
  put('vin', profile.vehicle_vin);
  put('vehicle_vin', profile.vehicle_vin);
  put('aliases', profile.aliases);
  put('prior_names', profile.aliases);
  put('former_name', profile.aliases);
  put('date_of_birth', profile.date_of_birth);
  put('dob', profile.date_of_birth);
  put('account_email', profile.account_emails[0]);
  put('subscription_email', profile.account_emails[0]);
  const payout =
    profile.payout_preference && payoutOptions.includes(profile.payout_preference)
      ? profile.payout_preference
      : null;
  return { answers, payout_method: payout };
}

export function claimProfileExport(profile: ClaimProfile): {
  legal_name: string | null;
  aliases: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  payout_preference: string | null;
  vehicle_vin: string | null;
  account_emails: string[];
  addresses: ClaimProfileAddress[];
  consent_at: string | null;
} {
  return {
    legal_name: profile.legal_name,
    aliases: profile.aliases,
    email: profile.email,
    phone: profile.phone,
    date_of_birth: profile.date_of_birth,
    payout_preference: profile.payout_preference,
    vehicle_vin: profile.vehicle_vin,
    account_emails: profile.account_emails,
    addresses: profile.addresses,
    consent_at: profile.consent_at,
  };
}
