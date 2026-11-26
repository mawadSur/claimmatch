'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, UserCog } from 'lucide-react';
import { MatchPreviewEntry } from './MatchPreviewEntry';

type Summary = {
  matchCount: number;
  strongCount: number;
  needsProfile: boolean;
  failed: boolean;
};

/**
 * On /lawsuits, signed-in users see live match counts from /api/mobile/dashboard
 * (same loader as the dashboard). Signed-out visitors get the preview banner.
 */
export function AccountMatchBanner() {
  const [signedIn, setSignedIn] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mobile/dashboard', { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setSignedIn(true);
            setSummary({ matchCount: 0, strongCount: 0, needsProfile: false, failed: true });
          }
          return;
        }
        const json = (await res.json()) as {
          profile?: { needsProfile?: boolean; onboarded?: boolean };
          matches?: { failed?: boolean; strong?: unknown[]; possible?: unknown[] };
        };
        const strong = json.matches?.strong?.length ?? 0;
        const possible = json.matches?.possible?.length ?? 0;
        if (!cancelled) {
          setSignedIn(true);
          setSummary({
            matchCount: strong + possible,
            strongCount: strong,
            needsProfile: json.profile?.needsProfile ?? !json.profile?.onboarded,
            failed: Boolean(json.matches?.failed),
          });
        }
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn || !summary) {
    return <MatchPreviewEntry variant="banner" />;
  }

  if (summary.failed) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <p className="text-sm font-semibold text-ink">Your matching settlements</p>
        <p className="mt-1 text-sm text-ink-muted">
          We couldn&rsquo;t load your matches right now. Open your dashboard to try again.
        </p>
        <Link href="/dashboard" className="btn-primary mt-4">
          Your dashboard <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  if (summary.needsProfile) {
    return (
      <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <UserCog className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-700">Your account</p>
            <p className="mt-1 text-lg font-semibold text-ink">Finish your profile for matching</p>
            <p className="mt-1 text-sm text-ink-muted">
              Add your state and a few optional details so we can rank open settlements that may
              apply to you — the same matcher as on your dashboard.
            </p>
          </div>
        </div>
        <Link href="/onboarding" className="btn-primary mt-4 shrink-0 sm:mt-0">
          Finish profile <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const hasMatches = summary.matchCount > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">Your account</p>
        <p className="mt-1 text-lg font-semibold text-ink">
          {hasMatches
            ? `${summary.matchCount} matching open settlement${summary.matchCount === 1 ? '' : 's'}`
            : 'No matching open settlements yet'}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {hasMatches
            ? `${summary.strongCount} strong match${summary.strongCount === 1 ? '' : 'es'}. Ranked from your profile — not a final eligibility decision.`
            : 'Nothing in the open catalog fits your profile today. Add more details or browse the full list below.'}
        </p>
      </div>
      <div className="mt-4 flex shrink-0 flex-col gap-2 sm:mt-0 sm:flex-row">
        <Link href="/dashboard" className="btn-primary">
          View your matches <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {!hasMatches ? (
          <Link href="/settings" className="btn-secondary">
            Update profile
          </Link>
        ) : null}
      </div>
    </div>
  );
}