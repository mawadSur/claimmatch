import type { Href } from 'expo-router';

/**
 * In-app paths. Route paths match the web's (plan 3.1), so a server href such
 * as a dashboard row's "/claim/{slug}" opens the same screen. Anything that
 * comes from outside the app (the server, a notification, a deep link's
 * ?next) is checked here before it reaches the router: the router opens an
 * absolute URL ("https://…", "mailto:…") in another app.
 */

/** "/claim/{slug}", the only shape a server or notification href may have (plan 3.1). */
export const CLAIM_HREF_PATTERN = /^\/claim\/[a-z0-9-]+$/;

/** Where a `next` parameter may send someone after logging in: the claim and settlement screens and the tab roots. */
const NEXT_PATH_PATTERN = /^\/(?:claim\/[a-z0-9-]+|lawsuits(?:\/[a-z0-9-]+)?|dashboard|settings(?:\/(?:details|legal))?)$/;

export type ClaimHref = `/claim/${string}`;

/** True for "/claim/{slug}" with a lowercase slug of letters, digits and hyphens. */
export function isClaimHref(value: unknown): value is ClaimHref {
  return typeof value === 'string' && CLAIM_HREF_PATTERN.test(value);
}

/** The claim screen for a settlement. */
export function claimHref(slug: string): ClaimHref {
  return `/claim/${encodeURIComponent(slug)}`;
}

/** The settlement detail screen. */
export function settlementHref(slug: string): Href {
  return `/lawsuits/${encodeURIComponent(slug)}` as Href;
}

/** A checked claim href as a router destination. */
export function claimRoute(href: ClaimHref): Href {
  return href as Href;
}

/**
 * The in-app path a `next` value names, or null when it is missing or not
 * one of the screens above. Stricter than the web's safeNextPath: no query,
 * no fragment, no other routes. Takes the first value of an array (a
 * repeated parameter, as useLocalSearchParams can return).
 */
export function safeNextPath(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && NEXT_PATH_PATTERN.test(value) ? value : null;
}

/** The log-in screen, carrying a checked `next` path when there is one. */
export function loginHref(next?: string | null): Href {
  const safe = safeNextPath(next);
  return safe ? { pathname: '/login', params: { next: safe } } : '/login';
}

/** The sign-up screen, carrying a checked `next` path when there is one. */
export function signupHref(next?: string | null): Href {
  const safe = safeNextPath(next);
  return safe ? { pathname: '/signup', params: { next: safe } } : '/signup';
}
