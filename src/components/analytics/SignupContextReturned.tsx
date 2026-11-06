'use client';

import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-js/react';
import { consumeSignupContext } from '@/lib/signup-context';

/** Fires once when a visitor returns to the claim they started from. */
export function SignupContextReturned({ claimPath }: { claimPath: string }) {
  const posthog = usePostHog();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !posthog) return;
    if (!consumeSignupContext(claimPath)) return;
    sent.current = true;
    posthog.capture('signup_context_returned');
  }, [posthog, claimPath]);

  return null;
}
