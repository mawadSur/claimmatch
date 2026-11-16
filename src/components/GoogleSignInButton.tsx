'use client';

import { OAuthSignInButtons, oauthReauthRequest, rememberBeforeOAuth, startOAuthSignIn } from './OAuthSignIn';

/**
 * "Continue with Google" (issue #50, OAUTH_SIGN_IN_ENABLED). The shared
 * provider logic lives in ./OAuthSignIn; these keep Google's own names.
 */

/** Starts a Google sign-in (Google's account chooser, hinted with loginHint when given). */
export function startGoogleSignIn(args: {
  next: string | null;
  loginHint?: string | null;
}): Promise<{ error: string; code: string } | null> {
  return startOAuthSignIn({ provider: 'google', ...args });
}

/** On /signup, saves ?next (pending-next cookie and claim context) before leaving for Google. */
export function rememberBeforeGoogle(mode: 'login' | 'signup', next: string | null): void {
  rememberBeforeOAuth(mode, next);
}

/** The sign-in-again prompt's Google request: back to this same page, for this account. */
export const googleReauthRequest = oauthReauthRequest;

/** "Continue with Google" alone, with the Terms line on /login and the divider. */
export function GoogleSignInButton({ mode, next }: { mode: 'login' | 'signup'; next: string | null }) {
  return <OAuthSignInButtons mode={mode} next={next} providers={['google']} />;
}
