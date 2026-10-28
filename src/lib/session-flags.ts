import { isInternalEmail } from '@/lib/internal-users';
import { cohortFromCampaign } from '@/lib/soft-launch';
import { createServiceClient } from '@/lib/supabase/server';

export interface SessionFlags {
  internal: boolean;
  cohort: string | null;
}

/**
 * On login / attribution: mark testers and copy a soft-launch campaign onto
 * the profile once. Never overwrites an existing cohort.
 */
export async function applySessionFlags(input: {
  userId: string;
  email: string | null | undefined;
}): Promise<SessionFlags> {
  const result: SessionFlags = { internal: false, cohort: null };
  try {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from('profiles')
      .select('is_internal, cohort, first_ref, first_utm_campaign')
      .eq('id', input.userId)
      .maybeSingle();

    const current = (profile ?? {}) as {
      is_internal?: boolean | null;
      cohort?: string | null;
      first_ref?: string | null;
      first_utm_campaign?: string | null;
    };

    const patch: Record<string, unknown> = {};
    const internal = Boolean(current.is_internal) || isInternalEmail(input.email);
    if (internal && !current.is_internal) patch.is_internal = true;
    result.internal = internal;

    let cohort = cohortFromCampaign(current.cohort);
    if (!cohort) {
      cohort = cohortFromCampaign(current.first_utm_campaign);
      if (!cohort && current.first_ref) {
        const { data: link } = await svc
          .from('share_links')
          .select('utm_campaign')
          .eq('code', current.first_ref)
          .maybeSingle();
        cohort = cohortFromCampaign((link as { utm_campaign?: string | null } | null)?.utm_campaign);
      }
      if (cohort) patch.cohort = cohort;
    }
    result.cohort = cohort;

    if (Object.keys(patch).length > 0) {
      const { error } = await svc.from('profiles').update(patch).eq('id', input.userId);
      if (error) console.error('[session-flags] update failed', { code: error.code });
    }
  } catch (err) {
    console.error('[session-flags] apply failed', err);
  }
  return result;
}
