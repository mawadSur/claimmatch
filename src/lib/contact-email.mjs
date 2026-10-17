/**
 * What counts as a usable public contact value. Shared by
 * src/lib/legal-contact.ts (what the pages show) and next.config.mjs (the
 * production build guard), so the two always agree. Plain JavaScript because
 * next.config.mjs cannot import TypeScript.
 */

// Braces or angle brackets mean an unfilled template ("{POSTAL_ADDRESS}").
const PLACEHOLDER = /[{}<>]|^(?:tbd|todo|n\/?a|none|null|undefined|placeholder|change[-_ ]?me)$/i;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
// Reserved example domains and local hosts never receive real mail.
const NON_DELIVERABLE_HOST = /(?:^|\.)(?:example|invalid|test|localhost)(?:\.[a-z]+)?$/i;

/**
 * The trimmed value, or null when it is unset, blank or a template placeholder.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function cleanContactValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER.test(trimmed)) return null;
  return trimmed;
}

/**
 * The address, trimmed, when it is well formed and not on a domain that never
 * receives mail; otherwise null.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function deliverableContactEmail(value) {
  const email = cleanContactValue(value);
  if (!email || !EMAIL.test(email)) return null;
  const host = email.slice(email.lastIndexOf('@') + 1);
  return NON_DELIVERABLE_HOST.test(host) ? null : email;
}

/**
 * Why a production build must stop, or null. Privacy, Terms, About and
 * Settings promise that people can ask for a copy of their data or its
 * deletion, and NEXT_PUBLIC_CONTACT_EMAIL is the only channel they show, so a
 * production deploy without a working inbox would break that promise. Only
 * production builds are checked (VERCEL_ENV=production): CI, local and preview
 * builds run without secrets.
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function productionContactProblem(env) {
  if (env.VERCEL_ENV !== 'production') return null;
  if (deliverableContactEmail(env.NEXT_PUBLIC_CONTACT_EMAIL)) return null;
  return (
    'NEXT_PUBLIC_CONTACT_EMAIL must be set, for Production, to an inbox someone reads ' +
    '(not a placeholder or an example domain). Privacy, Terms, About and Settings tell ' +
    'people to use it for data and deletion requests. Set it in Vercel, then redeploy.'
  );
}
