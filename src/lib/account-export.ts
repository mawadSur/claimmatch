import type { Claim, Match, Profile, ProfileFact } from '@/lib/types';
import { PRIVACY_POLICY_VERSION } from '@/lib/consent';

export interface AccountExportConsent {
  category: string;
  granted_at: string;
  policy_version: string;
}

export interface AccountExportPayload {
  exported_at: string;
  policy_version: string;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    state: string | null;
    phone: string | null;
    attributes: Record<string, unknown>;
    email_opt_in: boolean;
    email_frequency: 'instant' | 'weekly' | null;
    onboarded: boolean;
    created_at: string;
  };
  profile_facts: Array<{
    type: string;
    value: string;
    start_date: string | null;
    end_date: string | null;
    source: string | null;
    created_at?: string;
  }>;
  consent: AccountExportConsent[];
  matches: Array<{
    score: number;
    reasons: string[];
    dismissed: boolean;
    notified_at: string | null;
    lawsuit_title?: string | null;
    lawsuit_slug?: string | null;
  }>;
  claims: Array<{
    id: string;
    lawsuit_title?: string | null;
    status: string;
  }>;
}

export function buildAccountExport(input: {
  now?: Date;
  profile: Profile;
  facts: ProfileFact[];
  consent: AccountExportConsent[];
  matches: Array<
    Pick<Match, 'score' | 'reasons' | 'dismissed' | 'notified_at'> & {
      lawsuit?: { title?: string | null; slug?: string | null } | null;
    }
  >;
  claims: Array<Pick<Claim, 'id' | 'status'> & { lawsuit_title?: string | null }>;
}): AccountExportPayload {
  const profile = input.profile;
  return {
    exported_at: (input.now ?? new Date()).toISOString(),
    policy_version: PRIVACY_POLICY_VERSION,
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      state: profile.state,
      phone: profile.phone,
      attributes: profile.attributes ?? {},
      email_opt_in: profile.email_opt_in,
      email_frequency: profile.email_frequency ?? null,
      onboarded: profile.onboarded,
      created_at: profile.created_at,
    },
    profile_facts: input.facts.map((fact) => ({
      type: fact.type,
      value: fact.value,
      start_date: fact.start_date ?? null,
      end_date: fact.end_date ?? null,
      source: fact.source ?? null,
      created_at: fact.created_at,
    })),
    consent: input.consent,
    matches: input.matches.map((match) => ({
      score: match.score,
      reasons: match.reasons ?? [],
      dismissed: match.dismissed,
      notified_at: match.notified_at,
      lawsuit_title: match.lawsuit?.title ?? null,
      lawsuit_slug: match.lawsuit?.slug ?? null,
    })),
    claims: input.claims.map((claim) => ({
      id: claim.id,
      lawsuit_title: claim.lawsuit_title ?? null,
      status: claim.status,
    })),
  };
}
