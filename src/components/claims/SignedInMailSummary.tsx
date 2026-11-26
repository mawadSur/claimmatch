'use client';

import { useEffect, useState } from 'react';
import type { ClaimProfile } from '@/lib/claim-profile';
import { MailInInstructions } from './MailInInstructions';
import { PrintSummaryButton } from './PrintSummaryButton';
import type { ClaimActionDetails } from '@/lib/claim-actions';

/**
 * Public mail-in steps always render. When the visitor is signed in, fetch
 * the claim profile and add a printable prefilled summary.
 */
export function SignedInMailSummary({
  title,
  details,
  deadline,
}: {
  title: string;
  details: ClaimActionDetails;
  deadline: string | null;
}) {
  const [profile, setProfile] = useState<ClaimProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/claim-profile', { credentials: 'include' });
        if (!res.ok) return;
        const json = (await res.json()) as { profile?: ClaimProfile | null };
        if (!cancelled && json.profile) setProfile(json.profile);
      } catch {
        /* signed out or network — steps still show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <MailInInstructions title={title} details={details} deadline={deadline} profile={profile} />
      {profile ? <PrintSummaryButton label="Print this prefilled summary" /> : null}
    </div>
  );
}
