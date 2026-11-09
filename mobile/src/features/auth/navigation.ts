import type { Href } from 'expo-router';

/** A path checked by safeNextPath as a router destination (it only ever names screens that exist). */
export function checkedHref(path: string): Href {
  return path as Href;
}

/**
 * Where to go after logging in or signing up with a session: the checked
 * `next`, else Your claims (src/components/AuthForm.tsx). Open it with
 * router.dismissTo, which closes the sign-in sheet and returns to the screen
 * underneath when it is the destination, or opens the destination instead.
 */
export function afterSignInHref(next: string | null): Href {
  return next ? checkedHref(next) : '/dashboard';
}
