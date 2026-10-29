import { timingSafeEqual } from 'crypto';

/**
 * Authorize a cron request. Vercel Cron automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set in the project
 * (and `x-vercel-cron: 1`). The Bearer header is the only accepted secret.
 *
 * Security posture:
 *  - Secret accepted ONLY via the Authorization header (never a query string,
 *    which would leak into access logs). A dry-run query param is allowed
 *    only after this check succeeds.
 *  - Constant-time comparison to avoid timing oracles.
 *  - Fails CLOSED in production when CRON_SECRET is unset (returns false), so an
 *    unconfigured deploy can't be triggered by anyone. In non-production it is
 *    permissive to make local testing easy.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('authorization') || '';
  const expected = vercelCronAuthorizationHeader(secret);
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Exact Authorization value Vercel Cron sends when CRON_SECRET is set. */
export function vercelCronAuthorizationHeader(secret: string): string {
  return `Bearer ${secret}`;
}

/** True for the scheduled routes. Middleware must not redirect or session-refresh these. */
export function isCronApiPath(pathname: string): boolean {
  return pathname === '/api/cron' || pathname.startsWith('/api/cron/');
}

/**
 * Dry-run: plan every write and persist only the jobs row. Honors
 * INGEST_DRY_RUN=1 and, after authorizeCron, ?dryRun=1 / ?dry_run=1.
 */
export function cronRequestIsDryRun(req: Request): boolean {
  const env = process.env.INGEST_DRY_RUN;
  if (env === '1' || env === 'true') return true;
  try {
    const raw = new URL(req.url).searchParams.get('dryRun') ?? new URL(req.url).searchParams.get('dry_run');
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}
