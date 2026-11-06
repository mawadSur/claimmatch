'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { profileCompletedProperties } from '@/lib/analytics/events';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { US_STATES } from '@/lib/utils';
import { safeNextOr } from '@/lib/safe-next';
import { answersFromAttributes, type AttributeAnswers } from '@/lib/profile-attributes';
import {
  clearStoredMatchPreview,
  mergePreviewIntoAnswers,
  readStoredMatchPreview,
} from '@/lib/match-preview';
import {
  saveOnboardingProfile,
  skipOnboarding,
  type OnboardingField,
} from '@/app/onboarding/actions';
import { ProfileAttributesFields } from './ProfileAttributesFields';
import {
  ProfileFactsFields,
  draftsFromFacts,
  draftsToPayload,
  type DraftFact,
} from './ProfileFactsFields';
import type { ProfileFact } from '@/lib/types';

export interface OnboardingInitial {
  fullName: string;
  state: string;
  attributes?: Record<string, unknown> | null;
  facts?: ProfileFact[] | null;
}

/**
 * Onboarding: name and state, then a short matcher-question step. Health
 * questions sit in a clearly labeled optional section. Saving or skipping
 * ends on the dashboard (or the page the person came from).
 */
export function OnboardingWizard({
  initial,
  email,
  next,
  profileV2 = false,
  storeNote,
}: {
  initial: OnboardingInitial;
  email: string | null;
  next: string;
  profileV2?: boolean;
  storeNote?: string;
}) {
  const router = useRouter();
  const posthog = usePostHog();
  const lastStep = profileV2 ? 3 : 2;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [facts, setFacts] = useState<DraftFact[]>(() => draftsFromFacts(initial.facts));
  const [fullName, setFullName] = useState(initial.fullName);
  const [state, setState] = useState(initial.state);
  const [answers, setAnswers] = useState<AttributeAnswers>(() =>
    answersFromAttributes(initial.attributes),
  );
  const [previewHydrated, setPreviewHydrated] = useState(false);
  const [error, setError] = useState<{ message: string; field?: OnboardingField } | null>(null);
  const [action, setAction] = useState<null | 'save' | 'skip'>(null);
  const [, startTransition] = useTransition();
  const busy = action !== null;

  useEffect(() => {
    if (previewHydrated) return;
    const preview = readStoredMatchPreview();
    if (!preview) {
      setPreviewHydrated(true);
      return;
    }
    if (!state && preview.state) setState(preview.state);
    setAnswers((prev) => mergePreviewIntoAnswers(prev, preview));
    setPreviewHydrated(true);
  }, [previewHydrated, state]);

  function finish(
    result: Awaited<ReturnType<typeof saveOnboardingProfile>>,
    saved: { profile: boolean; hasName: boolean; hasState: boolean },
  ) {
    if (!result.ok) {
      setAction(null);
      if (result.signedOut) {
        router.push('/login?next=/onboarding');
        return;
      }
      setError({ message: result.error, field: result.field });
      return;
    }
    if (saved.profile) {
      const props = profileCompletedProperties({
        hasName: saved.hasName,
        hasState: saved.hasState,
      });
      if (props) posthog?.capture('profile_completed', props);
    }
    clearStoredMatchPreview();
    startTransition(() => {
      router.push(safeNextOr(next, '/dashboard?welcome=1'));
      router.refresh();
    });
  }

  async function run(kind: 'save' | 'skip') {
    setError(null);
    setAction(kind);
    try {
      const preview = readStoredMatchPreview();
      const merged = mergePreviewIntoAnswers(answers, preview);
      const savedProfile = kind === 'save' || Boolean(preview);
      const hasName = Boolean(fullName.trim());
      const hasState = Boolean((state || preview?.state || '').trim());
      finish(
        savedProfile
          ? await saveOnboardingProfile({
              full_name: fullName,
              state: state || preview?.state || '',
              attributes: merged,
              facts: profileV2 ? draftsToPayload(facts) : undefined,
            })
          : await skipOnboarding(),
        { profile: savedProfile, hasName, hasState },
      );
    } catch {
      setAction(null);
      setError({ message: 'We couldn’t reach ClaimMatch. Check your connection and try again.' });
    }
  }

  function continueToQuestions(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  function continueToFacts(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(3);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run('save');
  }

  const describedBy = (field: OnboardingField, help?: string) =>
    [help, error?.field === field ? 'onboarding-error' : null].filter(Boolean).join(' ') || undefined;

  return (
    <form
      onSubmit={step === 1 ? continueToQuestions : step === 2 && profileV2 ? continueToFacts : save}
      noValidate
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Step {step} of {lastStep}
      </p>
      {step === 1 ? (
        <>
          <h2 className="mt-1 text-lg font-bold">Your details</h2>
          <p className="mt-1 text-sm text-ink-muted">
            All optional. Next we&rsquo;ll ask a few short questions so we can
            find settlements that may apply to you.
          </p>
          {storeNote && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{storeNote}</p>}

          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="onboarding-name" className="field-label">
                Your name
              </label>
              <input
                id="onboarding-name"
                type="text"
                autoComplete="name"
                maxLength={120}
                className="field-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                aria-invalid={error?.field === 'full_name' ? true : undefined}
                aria-describedby={describedBy('full_name')}
              />
            </div>

            <div>
              <label htmlFor="onboarding-state" className="field-label">
                State you live in
              </label>
              <select
                id="onboarding-state"
                autoComplete="address-level1"
                className="field-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                aria-invalid={error?.field === 'state' ? true : undefined}
                aria-describedby={describedBy('state', 'onboarding-state-help')}
              >
                <option value="">Choose your state…</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p id="onboarding-state-help" className="mt-1.5 text-xs text-ink-muted">
                Some settlements are only for people in certain states.
              </p>
            </div>

            {email && (
              <p className="text-sm text-ink-muted">
                Signed in as <span className="font-semibold text-ink">{email}</span>.
              </p>
            )}
          </div>
        </>
      ) : step === 2 ? (
        <>
          <h2 className="mt-1 text-lg font-bold">A few things that help us match you</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Vehicles, accounts, shopping, streaming, work — whatever applies.
            You can edit these anytime in Settings.
          </p>
          <div className="mt-6">
            <ProfileAttributesFields
              idPrefix="onboarding"
              answers={answers}
              onChange={setAnswers}
            />
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-lg font-bold">Purchases, work, and places (optional)</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Add brands, employers, or locations with dates if you remember them.
            You can edit this later under Settings → My profile.
          </p>
          <div className="mt-6">
            <ProfileFactsFields drafts={facts} onChange={setFacts} idPrefix="onboarding-facts" />
          </div>
        </>
      )}

      {error && (
        <p
          id="onboarding-error"
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error.message}
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((step - 1) as 1 | 2 | 3)}
            disabled={busy}
            className="btn-ghost"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        )}
        <button type="submit" disabled={busy} className="btn-primary">
          {action === 'save' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : step < lastStep ? (
            <>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          ) : (
            <>
              Save and continue <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
        <button type="button" onClick={() => void run('skip')} disabled={busy} className="btn-ghost">
          {action === 'skip' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Skip for now
        </button>
      </div>
    </form>
  );
}
