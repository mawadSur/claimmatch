'use client';

import { OAuthSignInButtons, oauthReauthRequest, startOAuthSignIn } from './OAuthSignIn';

/**
 * "Continue with Apple" on the web (APPLE_SIGN_IN_ENABLED). The shared
 * provider logic lives in ./OAuthSignIn. Apple's web flow may not share the
 * member's name (onboarding asks for it) and may give a private relay
 * address (@privaterelay.appleid.com), which is an ordinary email address
 * everywhere in Lawsuit AI.
 */

/** Starts an Apple sign-in (name and email scopes; Apple has no account hint). */
export function startAppleSignIn(args: { next: string | null }): Promise<{ error: string; code: string } | null> {
  return startOAuthSignIn({ provider: 'apple', next: args.next });
}

/** The sign-in-again prompt's Apple request: back to this same page. */
export function appleReauthRequest(location: { pathname: string; search: string }): { next: string } {
  return { next: oauthReauthRequest(location, null).next };
}

/** "Continue with Apple" alone, with the Terms line on /login and the divider. */
export function AppleSignInButton({ mode, next }: { mode: 'login' | 'signup'; next: string | null }) {
  return <OAuthSignInButtons mode={mode} next={next} providers={['apple']} />;
}
