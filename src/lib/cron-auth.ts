import { timingSafeEqual } from 'crypto';

/**
 * Authorize a cron request. Vercel Cron automatically sends
 * `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set in the project.
 *
 * Security posture:
 *  - Secret accepted ONLY via the Authorization header (never a query string,
 *    which would leak into access logs).
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
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
