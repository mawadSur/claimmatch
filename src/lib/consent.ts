import type { ProfileFact, ProfileFactType } from '@/lib/types';
import { PROFILE_FACT_TYPE_SET } from '@/lib/profile-facts';

/** Draft privacy-policy version recorded with each fact-collection grant. */
export const PRIVACY_POLICY_VERSION = '2026-11-04-draft';

export type ConsentCategory = ProfileFactType;

export interface ConsentRow {
  user_id: string;
  category: ConsentCategory;
  policy_version: string;
  granted_at?: string;
}

export function consentCategoriesFromFacts(
  facts: Array<Pick<ProfileFact, 'type'>>,
): ConsentCategory[] {
  const seen = new Set<ConsentCategory>();
  for (const fact of facts) {
    if (PROFILE_FACT_TYPE_SET.has(fact.type)) {
      seen.add(fact.type);
    }
  }
  return [...seen];
}

export function consentRowsForFacts(
  userId: string,
  facts: Array<Pick<ProfileFact, 'type'>>,
  policyVersion: string = PRIVACY_POLICY_VERSION,
): ConsentRow[] {
  return consentCategoriesFromFacts(facts).map((category) => ({
    user_id: userId,
    category,
    policy_version: policyVersion,
  }));
}

/** Insert consent rows for the fact types just collected. Safe to re-run. */
export async function recordFactConsent(
  supabase: { from: (table: string) => { upsert: (rows: ConsentRow[], opts: { onConflict: string; ignoreDuplicates: boolean }) => unknown } },
  userId: string,
  facts: Array<Pick<ProfileFact, 'type'>>,
): Promise<void> {
  const rows = consentRowsForFacts(userId, facts);
  if (rows.length === 0) return;
  const result = (await supabase.from('consent').upsert(rows, {
    onConflict: 'user_id,category,policy_version',
    ignoreDuplicates: true,
  })) as { error?: { code?: string } | null };
  if (result.error) {
    console.error('[consent] record failed', { code: result.error.code ?? null });
  }
}
