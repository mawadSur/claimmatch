'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { US_STATES } from '@/lib/utils';
import {
  saveOnboardingProfile,
  skipOnboarding,
  type OnboardingField,
} from '@/app/onboarding/actions';

export interface OnboardingInitial {
  fullName: string;
  state: string;
  zip: string;
}

/**
 * Onboarding: a short profile form (name, state, ZIP; all optional). No
 * eligibility quiz, no health questions, no match count and no dollar
 * estimate. Saving or skipping ends on the dashboard (or the page the person
 * came from), where a welcome note explains how ClaimMatch works.
 */
export function OnboardingWizard({
  initial,
  email,
  next,
}: {
  initial: OnboardingInitial;
  email: string | null;
  next: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [state, setState] = useState(initial.state);
  const [zip, setZip] = useState(initial.zip);
  const [error, setError] = useState<{ message: string; field?: OnboardingField } | null>(null);
  const [action, setAction] = useState<null | 'save' | 'skip'>(null);
  const [, startTransition] = useTransition();
  const busy = action !== null;

  function finish(result: Awaited<ReturnType<typeof saveOnboardingProfile>>) {
    if (!result.ok) {
      setAction(null);
      if (result.signedOut) {
        router.push('/login?next=/onboarding');
        return;
      }
      setError({ message: result.error, field: result.field });
      return;
    }
    startTransition(() => {
      router.push(next);
      router.refresh();
    });
  }

  async function run(kind: 'save' | 'skip') {
    setError(null);
    setAction(kind);
    try {
      finish(
        kind === 'save'
          ? await saveOnboardingProfile({ full_name: fullName, state, zip })
          : await skipOnboarding(),
      );
    } catch {
      setAction(null);
      setError({ message: 'We couldn’t reach ClaimMatch. Check your connection and try again.' });
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    void run('save');
  }

  const describedBy = (field: OnboardingField, help?: string) =>
    [help, error?.field === field ? 'onboarding-error' : null].filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={save} noValidate className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
      <h2 className="text-lg font-bold">Your details</h2>
      <p className="mt-1 text-sm text-ink-muted">
        All optional. You can change your name and state later in Settings.
      </p>

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

        <div>
          <label htmlFor="onboarding-zip" className="field-label">
            ZIP code
          </label>
          <input
            id="onboarding-zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            className="field-input sm:max-w-[10rem]"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            aria-invalid={error?.field === 'zip' ? true : undefined}
            aria-describedby={describedBy('zip')}
          />
        </div>

        {email && (
          <p className="text-sm text-ink-muted">
            Signed in as <span className="font-semibold text-ink">{email}</span>.
          </p>
        )}
      </div>

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
        <button type="submit" disabled={busy} className="btn-primary">
          {action === 'save' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…
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
