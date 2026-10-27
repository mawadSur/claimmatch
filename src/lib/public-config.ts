/**
 * Public site config that pages and emails may show. Every value comes from
 * env. Unset / placeholder values stay null so we never print a Sur Consulting
 * inbox, a TODO token, or a project name nobody created.
 *
 * TODO (B2): NEXT_PUBLIC_CONTACT_EMAIL — ClaimMatch inbox, not Sur Consulting
 * TODO (B2/B5): NEXT_PUBLIC_LEGAL_ENTITY, NEXT_PUBLIC_POSTAL_ADDRESS
 * TODO (B3): NEXT_PUBLIC_SITE_URL — claimmatch.com (or the chosen domain)
 * TODO (B6): NEXT_PUBLIC_POSTHOG_KEY + NEXT_PUBLIC_POSTHOG_PROJECT — ClaimMatch
 *            PostHog project, not the "Sur Website" project
 */

import { legalContact, type LegalContact } from './legal-contact';
import { SITE } from './utils';

export interface PublicPosthogConfig {
  /** Project API key. Null when unset; analytics stay off. */
  key: string | null;
  /** Ingest host. Null when unset (PostHogProvider uses the US default). */
  host: string | null;
  /** Human project name/id for operators. Null until B6 is decided. */
  project: string | null;
}

export interface PublicConfig {
  siteUrl: string;
  contact: LegalContact;
  posthog: PublicPosthogConfig;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function publicConfig(
  env: Record<string, string | undefined> = process.env,
): PublicConfig {
  return {
    siteUrl: clean(env.NEXT_PUBLIC_SITE_URL) || SITE.url,
    contact: legalContact(),
    posthog: {
      key: clean(env.NEXT_PUBLIC_POSTHOG_KEY),
      host: clean(env.NEXT_PUBLIC_POSTHOG_HOST),
      project: clean(env.NEXT_PUBLIC_POSTHOG_PROJECT),
    },
  };
}
