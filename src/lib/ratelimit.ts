// Tiny in-memory sliding-window rate limiter.
//
// NOTE: this is best-effort and per-instance — the timestamp map lives in the
// memory of a single serverless/Node process, so it protects one Vercel region
// (or one warm lambda) at a time and resets on cold start. That's plenty to
// blunt casual abuse of public endpoints. Swap for Upstash/Redis (a shared
// store) when you need accurate global limits across regions and instances.

interface RateLimitOptions {
  /** Max requests allowed within the window. Default 10. */
  limit?: number;
  /** Rolling window length in milliseconds. Default 60_000 (60s). */
  windowMs?: number;
}

export interface RateLimitResult {
  /** True when the request is allowed. */
  ok: boolean;
  /** Seconds until the caller may retry (0 when ok). */
  retryAfter: number;
}

// key -> ascending list of request timestamps (ms) still inside the window.
const hits = new Map<string, number[]>();

// Opportunistic global sweep so keys that go quiet don't leak memory forever.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, times] of hits) {
    const fresh = times.filter((t) => now - t < windowMs);
    if (fresh.length === 0) hits.delete(k);
    else hits.set(k, fresh);
  }
}

/**
 * Sliding-window rate limit for `key`. Records the current request when it is
 * allowed. Returns `{ ok, retryAfter }` where `retryAfter` is the whole number
 * of seconds until a slot frees up.
 */
export function rateLimit(key: string, opts?: RateLimitOptions): RateLimitResult {
  const limit = opts?.limit ?? 10;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  sweep(now, windowMs);

  const windowStart = now - windowMs;
  const prior = hits.get(key) ?? [];
  // Prune this key's stale timestamps before counting.
  const recent = prior.filter((t) => t > windowStart);

  if (recent.length >= limit) {
    // The oldest in-window hit determines when the window slides forward.
    const oldest = recent[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    hits.set(key, recent);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfter: 0 };
}

/**
 * Derive a rate-limit key from a request's client IP. Reads the first hop of
 * `x-forwarded-for` (the original client on Vercel), falling back to
 * `x-real-ip`, then a shared `'anon'` bucket when no IP header is present.
 */
export function ipKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'anon';
}
