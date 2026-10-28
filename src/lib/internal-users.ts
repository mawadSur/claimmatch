/**
 * INTERNAL_EMAILS is a comma-separated allowlist of tester accounts.
 * Those people get profiles.is_internal = true and a PostHog `internal`
 * person property so traction counts can exclude them.
 */

export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes('@'));
}

export function internalEmailsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseEmailList(env.INTERNAL_EMAILS);
}

export function isInternalEmail(
  email: string | null | undefined,
  list: string[] = internalEmailsFromEnv(),
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return list.includes(normalized);
}
