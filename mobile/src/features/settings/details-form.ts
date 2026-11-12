import type { AttributeAnswers } from '@shared/lib/profile-attributes';
import { parseSettingsInput } from '@shared/lib/settings-input';

import { settings } from '@/copy/settings';
import type { SettingsInput } from '@/data/profile';

import { sameAnswers } from './fields';

/** What the Your details and emails form holds. */
export interface DetailsValues {
  fullName: string;
  state: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  /** "Save this address on my profile for future claims." */
  addressConsent: boolean;
  metricsConsent: boolean;
  answers: AttributeAnswers;
}

export type DetailsField = 'full_name' | 'phone' | 'address_line1' | 'address_line2' | 'city' | 'consent';
export type DetailsErrors = Partial<Record<DetailsField, string>>;

/** Fields in the order the form shows them: the first invalid one is the one to point at. */
export const DETAILS_FIELD_ORDER: readonly DetailsField[] = [
  'full_name',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'consent',
];

/** An address is being saved once line 1 or the city is filled in (src/components/claims/PrefillPacket.tsx). */
export function hasAddress(values: Pick<DetailsValues, 'addressLine1' | 'city'>): boolean {
  return Boolean(values.addressLine1.trim() || values.city.trim());
}

/**
 * Checks each text field with the server's own rules (parseSettingsInput), so
 * the message shows under the field it belongs to, and asks for the consent
 * box before a new address is saved, as PrefillPacket does.
 */
export function detailsErrors(
  values: DetailsValues,
  consentStored: boolean,
  collectPhone = true,
): DetailsErrors {
  const errors: DetailsErrors = {};
  const text: [Exclude<DetailsField, 'consent'>, string][] = [
    ['full_name', values.fullName],
    ...(collectPhone ? [['phone', values.phone] as [Exclude<DetailsField, 'consent'>, string]] : []),
    ['address_line1', values.addressLine1],
    ['address_line2', values.addressLine2],
    ['city', values.city],
  ];
  for (const [field, value] of text) {
    const checked = parseSettingsInput({ [field]: value });
    if (!checked.ok) errors[field] = checked.error;
  }
  if (hasAddress(values) && !consentStored && !values.addressConsent) {
    errors.consent = settings.consentRequired.text;
  }
  return errors;
}

/** The first error in form order, or null. */
export function firstDetailsError(errors: DetailsErrors): string | null {
  for (const field of DETAILS_FIELD_ORDER) {
    const message = errors[field];
    if (message) return message;
  }
  return null;
}

/**
 * The POST /api/settings body for the form (the web's NotificationPrefs
 * fields plus the copy-ready address). It never sends email_opt_in: the app
 * hides that switch while those emails are paused, so the choice saved on
 * the web stays as it is (see DetailsForm). The address is sent once consent
 * exists, or is given now with an address; a first consent is stamped with
 * `consentAt`. The matching answers are sent only when they differ from
 * `savedAnswers` (the ones on file): the server replaces every stored answer
 * with what it gets, so sending them would also clear a health answer saved
 * on the web, which the app never asks for (plan 5).
 */
export function detailsBody(
  values: DetailsValues,
  consentStored: boolean,
  consentAt: Date,
  savedAnswers: AttributeAnswers,
  collectPhone = true,
): SettingsInput {
  const body: SettingsInput = {
    full_name: values.fullName,
    state: values.state,
    match_metrics_consent: values.metricsConsent,
  };
  if (collectPhone) body.phone = values.phone;
  if (!sameAnswers(values.answers, savedAnswers)) body.attributes = values.answers;
  if (consentStored || (hasAddress(values) && values.addressConsent)) {
    body.address_line1 = values.addressLine1;
    body.address_line2 = values.addressLine2;
    body.city = values.city;
    if (!consentStored) body.prefill_consent_at = consentAt.toISOString();
  }
  return body;
}
